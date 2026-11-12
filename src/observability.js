const OPERATIONS = Object.freeze(['issue', 'verify', 'consume', 'fallback']);
const OUTCOMES = Object.freeze(['success', 'rejected', 'error']);
const FALLBACK_REASONS = Object.freeze(['outage', 'policy', 'retry']);
const increment = value => Math.min(Number.MAX_SAFE_INTEGER, value + 1);

function providerIds(providers) {
  if (!Array.isArray(providers) || providers.length < 1 || providers.length > 64 || providers.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) || new Set(providers).size !== providers.length || providers.includes('unknown')) throw new Error('Provide 1..64 distinct configured provider IDs; unknown is reserved');
  return Object.freeze([...providers]);
}

/** A diagnostic callback is never permitted to change the authorization result. */
export function safeObserver(onEvent) {
  if (onEvent === undefined) return () => {};
  if (typeof onEvent !== 'function') throw new Error('onEvent must be a function');
  return event => {
    try {
      const pending = onEvent(Object.freeze({...event}));
      if (pending && typeof pending.then === 'function') Promise.resolve(pending).catch(() => {});
    } catch { /* Observability failure cannot grant or deny authorization. */ }
  };
}

function percentile(values, proportion) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * proportion) - 1)];
}

/** Fixed labels, cumulative outcomes and a bounded recent latency sample per row. */
export function createMetrics({providers, maxLatencySamples = 512, maxDurationMs = 300000} = {}) {
  const ids = providerIds(providers);
  if (!Number.isInteger(maxLatencySamples) || maxLatencySamples < 1 || maxLatencySamples > 4096) throw new Error('maxLatencySamples must be 1..4096');
  if (!Number.isFinite(maxDurationMs) || maxDurationMs <= 0 || maxDurationMs > 3600000) throw new Error('maxDurationMs must be >0 and <=3600000');
  const allowed = new Set(ids);
  const rows = new Map();
  let droppedEvents = 0;
  const fallbackReasons = new Map([...ids, 'unknown'].map(id => [id, {outage: 0, policy: 0, retry: 0}]));
  const keyFor = (provider, operation) => `${provider}:${operation}`;
  const reset = () => {
    rows.clear(); droppedEvents = 0;
    for (const provider of [...ids, 'unknown']) {
      for (const operation of OPERATIONS) rows.set(keyFor(provider, operation), {provider, operation, success: 0, rejected: 0, error: 0, latencies: [], cursor: 0});
      fallbackReasons.set(provider, {outage: 0, policy: 0, retry: 0});
    }
  };
  reset();
  const observe = event => {
    if (!event || typeof event !== 'object' || !OPERATIONS.includes(event.operation) || !OUTCOMES.includes(event.outcome) || !Number.isFinite(event.durationMs) || event.durationMs < 0 || event.durationMs > maxDurationMs) {
      droppedEvents = increment(droppedEvents); return false;
    }
    const provider = allowed.has(event.provider) ? event.provider : 'unknown';
    const row = rows.get(keyFor(provider, event.operation));
    row[event.outcome] = increment(row[event.outcome]);
    if (row.latencies.length < maxLatencySamples) row.latencies.push(event.durationMs);
    else { row.latencies[row.cursor] = event.durationMs; row.cursor = (row.cursor + 1) % maxLatencySamples; }
    return true;
  };
  const recordFallback = ({provider, reason, durationMs = 0} = {}) => {
    if (!FALLBACK_REASONS.includes(reason)) throw new Error('Fallback reason must be outage, policy or retry');
    if (!observe({provider, operation: 'fallback', outcome: 'success', durationMs})) return false;
    const counts = fallbackReasons.get(allowed.has(provider) ? provider : 'unknown');
    counts[reason] = increment(counts[reason]);
    return true;
  };
  const snapshot = () => ({
    schemaVersion: 1,
    scope: 'In-process diagnostic counters; aggregate externally for multiple workers. No user or token labels.',
    latencyScope: 'Most recent bounded events per provider/operation; counters are cumulative until reset.',
    configuredProviders: [...ids], maxLatencySamples, droppedEvents,
    rows: [...rows.values()].map(row => {
      const total = row.success + row.rejected + row.error;
      return {provider: row.provider, operation: row.operation, total, outcomes: {success: row.success, rejected: row.rejected, error: row.error}, successRate: total ? row.success / total : null, latency: {sampleCount: row.latencies.length, p50Ms: percentile(row.latencies, 0.5), p95Ms: percentile(row.latencies, 0.95)}};
    }),
    fallbacks: [...fallbackReasons].map(([provider, reasons]) => ({provider, reasons: {...reasons}})),
  });
  return Object.freeze({observe, recordFallback, snapshot, reset});
}

/** Operational outage state only. This never authenticates or changes assurance. */
export function createCircuitBreaker({providers, failureThreshold = 3, cooldownMs = 30000, now = Date.now} = {}) {
  const ids = providerIds(providers);
  if (!Number.isInteger(failureThreshold) || failureThreshold < 1 || failureThreshold > 1000 || !Number.isInteger(cooldownMs) || cooldownMs < 1 || cooldownMs > 3600000 || typeof now !== 'function') throw new Error('Invalid circuit breaker configuration');
  const states = new Map(ids.map(id => [id, {failures: 0, openedAt: null}]));
  const observe = event => {
    if (!event || !['issue', 'verify'].includes(event.operation) || !OUTCOMES.includes(event.outcome) || !states.has(event.provider)) return;
    const state = states.get(event.provider);
    if (event.outcome === 'error') {
      state.failures = Math.min(failureThreshold, state.failures + 1);
      if (state.failures >= failureThreshold && state.openedAt === null) state.openedAt = now();
    } else if (event.outcome === 'success' && state.openedAt === null) state.failures = 0;
    // Rejected proofs are neither availability failures nor a signal to reopen.
  };
  const recordProbe = (provider, {ok} = {}) => {
    if (!states.has(provider) || typeof ok !== 'boolean') throw new Error('Known provider and boolean probe result required');
    const state = states.get(provider);
    if (state.openedAt === null) return false;
    if (now() - state.openedAt < cooldownMs) return false;
    if (ok) { state.failures = 0; state.openedAt = null; }
    else state.openedAt = now();
    return true;
  };
  const health = () => Object.fromEntries([...states].map(([provider, state]) => [provider, state.openedAt === null]));
  const snapshot = () => ({failureThreshold, cooldownMs, providers: [...states].map(([provider, state]) => ({provider, state: state.openedAt === null ? 'closed' : 'open', operationalFailures: state.failures, retryProbeAfterMs: state.openedAt === null ? null : Math.max(0, state.openedAt + cooldownMs - now())}))});
  return Object.freeze({observe, recordProbe, health, snapshot});
}
