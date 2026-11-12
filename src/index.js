import {randomBytes, createHash} from 'node:crypto';
import {selectProvider} from './policy.js';
import {resolvePolicy} from './runtime-policy.js';
import {safeObserver} from './observability.js';
export {recommend, selectProvider, capabilities, assuranceTypes} from './policy.js';
export {resolvePolicy} from './runtime-policy.js';

const digest = value => createHash('sha256').update(value).digest('hex');
const contextKey = c => {
  if (!c || ['tenant', 'action', 'subject'].some(k => typeof c[k] !== 'string' || !c[k] || c[k].length > 512)) throw new Error('tenant, action and opaque subject are required');
  return digest(JSON.stringify([c.tenant, c.action, c.subject]));
};

/** Development only. Production stores must implement atomic take and expiry. */
export class MemoryStore {
  constructor({now = Date.now, maxEntries = 10000} = {}) { this.now = now; this.maxEntries = maxEntries; this.entries = new Map(); }
  async put(key, value, expiresAt) {
    for (const [k, entry] of this.entries) if (entry.expiresAt <= this.now()) this.entries.delete(k);
    if (this.entries.size >= this.maxEntries) throw new Error('Store capacity exceeded');
    this.entries.set(key, {value, expiresAt});
  }
  async take(key) {
    const entry = this.entries.get(key);
    this.entries.delete(key); // Atomic within this single Node process, before yielding.
    return entry && entry.expiresAt > this.now() ? entry.value : undefined;
  }
}

export function powAdapter({difficulty = 3} = {}) {
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) throw new Error('difficulty must be 1..5');
  return {
    assurance: 'automation-cost',
    async issue() { const salt = randomBytes(24).toString('hex'); return {public: {type: 'pow', salt, difficulty}, private: {salt, difficulty}}; },
    async verify({response, state}) {
      return typeof response === 'string' && /^[0-9]{1,16}$/.test(response) && digest(`${state.salt}:${response}`).startsWith('0'.repeat(state.difficulty));
    }
  };
}

const endpoints = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  hcaptcha: 'https://api.hcaptcha.com/siteverify',
  recaptcha: 'https://www.google.com/recaptcha/api/siteverify'
};

/** Verify official provider tokens. Widgets and credentials remain product-owned. */
export function siteverifyAdapter({provider, secret, siteKey, hostname, action, minScore, recaptchaMode, testMode = false, fetchImpl = globalThis.fetch}) {
  if (!Object.hasOwn(endpoints, provider) || typeof secret !== 'string' || !secret || typeof siteKey !== 'string' || !siteKey || typeof hostname !== 'string' || !hostname) throw new Error('Known provider, siteKey, secret and expected hostname required');
  if (action !== undefined && (provider === 'hcaptcha' || typeof action !== 'string' || !action)) throw new Error('action binding unsupported or invalid');
  if (minScore !== undefined && (provider !== 'recaptcha' || !Number.isFinite(minScore) || minScore < 0 || minScore > 1)) throw new Error('minScore requires recaptcha and 0..1');
  if (provider === 'recaptcha' && (!['v2', 'v3'].includes(recaptchaMode) || (recaptchaMode === 'v3' && (!action || minScore === undefined)) || (recaptchaMode === 'v2' && (action !== undefined || minScore !== undefined)))) throw new Error('Specify recaptchaMode v2 or v3; v3 requires action and minScore; v2 uses neither');
  if (typeof testMode !== 'boolean') throw new Error('testMode must be boolean');
  const dummyKey = provider === 'hcaptcha' ? /^\d0000000-ffff-ffff-ffff-00000000000\d$/.test(siteKey) : provider === 'turnstile' ? /^[123]x0+[A-Z]{2}$/.test(siteKey) : siteKey === '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';
  if (dummyKey && !testMode) throw new Error('Official dummy test keys require explicit testMode and must not protect production actions');
  return {
    assurance: 'bot-mitigation',
    async issue() {
      const cData = provider === 'turnstile' ? randomBytes(24).toString('base64url') : undefined;
      return {public: {type: provider, siteKey, testOnly: testMode, ...(action ? {action} : {}), ...(cData ? {cData} : {}), ...(recaptchaMode ? {recaptchaMode} : {})}, private: {cData}};
    },
    async verify({response, state}) {
      if (typeof response !== 'string' || !response || response.length > 16384) return false;
      const body = new URLSearchParams({secret, response});
      if (siteKey && provider === 'hcaptcha') body.set('sitekey', siteKey);
      try {
        const res = await fetchImpl(endpoints[provider], {method: 'POST', body, signal: AbortSignal.timeout(5000), redirect: 'error'});
        if (!res.ok) throw new Error('Provider verification HTTP failure');
        const result = await res.json();
        if (!result || typeof result !== 'object' || typeof result.success !== 'boolean') throw new Error('Provider verification response malformed');
        return result.success === true && result.hostname === hostname && (!action || result.action === action) && (provider !== 'turnstile' || (typeof state?.cData === 'string' && result.cdata === state.cData)) && (minScore === undefined || (Number.isFinite(result.score) && result.score >= minScore));
      } catch { throw new Error('Provider verification unavailable'); }
    }
  };
}

export class Kechap {
  constructor({adapters, store, now = Date.now, ttlMs = 120000, attestationTtlMs = 60000, onEvent}) {
    if (!adapters || !Object.keys(adapters).length) throw new Error('Adapters required');
    if (![ttlMs, attestationTtlMs].every(v => Number.isInteger(v) && v > 0 && v <= 300000)) throw new Error('TTL must be 1..300000 ms');
    this.adapters = new Map(Object.entries(adapters)); this.store = store ?? new MemoryStore({now}); this.now = now; this.ttlMs = ttlMs; this.attestationTtlMs = attestationTtlMs;
    this.observe = safeObserver(onEvent);
    for (const operation of ['issue', 'verify', 'consume']) {
      const original = this[operation].bind(this);
      this[operation] = async input => {
        const start = performance.now();
        // Per-call metadata is local; never shared across concurrent verifications.
        const trace = {provider: operation === 'issue' && input?.providers?.length === 1 ? input.providers[0] : 'unknown', outcome: null};
        try {
          const result = await original(input, trace);
          this.observe({operation, provider: result.provider ?? trace.provider, outcome: trace.outcome ?? (result.ok === false ? 'rejected' : 'success'), durationMs: performance.now() - start});
          return result;
        } catch (error) {
          this.observe({operation, provider: trace.provider, outcome: 'error', durationMs: performance.now() - start});
          throw error;
        }
      };
    }
  }
  async issueWithPolicy({context, sessionId, policy, risk, previous, health, requiredAssurance}) {
    contextKey(context);
    const decision = resolvePolicy({policy, action: context.action, risk, sessionId, previous, health, requiredAssurance});
    if (decision.configuredProviders.some(id => !this.adapters.has(id) || this.adapters.get(id).assurance !== decision.assurance)) throw new Error('Policy contains an unconfigured or weaker provider');
    return this.issue({context, sessionId, providers: [decision.provider], assurance: decision.assurance, policyVersion: decision.policyVersion, risk: decision.risk});
  }
  async issue({context, providers, assurance, sessionId, mode = 'stable', previous, policyVersion = 'unversioned', risk}, trace = {}) {
    const binding = contextKey(context);
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('Server-generated sessionId required');
    if (!Array.isArray(providers) || !providers.length || providers.some(id => !this.adapters.has(id) || this.adapters.get(id).assurance !== assurance)) throw new Error('All rotation providers must be configured and meet the requested assurance');
    const provider = selectProvider({providers, sessionId, mode, previous});
    trace.provider = provider;
    const adapter = this.adapters.get(provider);
    const challenge = await adapter.issue({context});
    const id = randomBytes(24).toString('base64url');
    const expiresAt = this.now() + this.ttlMs;
    await this.store.put(`challenge:${id}`, {provider, binding, assurance, policyVersion, risk, state: challenge.private, expiresAt}, expiresAt);
    return {id, provider, assurance, policyVersion, challenge: challenge.public, expiresAt};
  }
  async verify({id, context, response}, trace = {}) {
    const binding = contextKey(context);
    if (typeof id !== 'string' || id.length > 128) return {ok: false};
    const record = await this.store.take(`challenge:${id}`);
    if (record) trace.provider = record.provider;
    if (!record || record.expiresAt <= this.now() || record.binding !== binding) return {ok: false};
    const adapter = this.adapters.get(record.provider);
    if (!adapter || adapter.assurance !== record.assurance) return {ok: false};
    let valid = false;
    try { valid = await adapter.verify({response, state: record.state, context}); } catch { trace.outcome = 'error'; /* fail closed */ }
    if (valid !== true || record.expiresAt <= this.now()) return {ok: false};
    const token = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + this.attestationTtlMs;
    await this.store.put(`attestation:${digest(token)}`, {binding, provider: record.provider, assurance: record.assurance, policyVersion: record.policyVersion, expiresAt}, expiresAt);
    return {ok: true, token, expiresAt, provider: record.provider, assurance: record.assurance, policyVersion: record.policyVersion};
  }
  async consume({token, context}, trace = {}) {
    const binding = contextKey(context);
    if (typeof token !== 'string' || token.length > 128) return {ok: false};
    const record = await this.store.take(`attestation:${digest(token)}`);
    if (record) trace.provider = record.provider;
    if (!record || record.expiresAt <= this.now() || record.binding !== binding) return {ok: false};
    return {ok: true, provider: record.provider, assurance: record.assurance, policyVersion: record.policyVersion};
  }
}
