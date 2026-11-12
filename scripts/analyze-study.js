import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const STUDY_PROTOCOL = 'kechap-human-pilot-v1';
export const CONSENT_VERSION = 'kechap-study-consent-v1';
export const STUDY_SURFACES = Object.freeze(['static-choice', 'drag-rotate', 'dynamic-sequence']);
export const STUDY_ORDERS = Object.freeze([
  ['static-choice', 'drag-rotate', 'dynamic-sequence'],
  ['static-choice', 'dynamic-sequence', 'drag-rotate'],
  ['drag-rotate', 'static-choice', 'dynamic-sequence'],
  ['drag-rotate', 'dynamic-sequence', 'static-choice'],
  ['dynamic-sequence', 'static-choice', 'drag-rotate'],
  ['dynamic-sequence', 'drag-rotate', 'static-choice']
].map(order => Object.freeze(order)));
const DEVICES = ['desktop', 'mobile', 'tablet', 'unspecified'];
const ACCESS = ['keyboard', 'screen-reader', 'reduced-motion', 'motor', 'low-vision', 'low-resource', 'unspecified'];
const OUTCOMES = ['success', 'rejected', 'error', 'dropout'];
const GROUND_TRUTH = ['valid-interaction', 'invalid-interaction', 'unreviewed'];
const HEX64 = /^[a-f0-9]{64}$/;
const boundedInteger = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const allowedKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : null;

export function wilson95(successes, n) {
  if (!boundedInteger(n, 0, 10000000) || !boundedInteger(successes, 0, n)) throw new Error('Invalid binomial counts');
  if (!n) return null;
  const z = 1.959963984540054, rate = successes / n, denominator = 1 + z * z / n;
  const center = (rate + z * z / (2 * n)) / denominator;
  const radius = z * Math.sqrt(rate * (1 - rate) / n + z * z / (4 * n * n)) / denominator;
  return {low: Math.max(0, center - radius), high: Math.min(1, center + radius)};
}

/** Deterministic study assignment from a public allocation seed, not a CAPTCHA secret. */
export function studyAssignment(participantIndex, allocationSeed) {
  if (!boundedInteger(participantIndex, 0, 999999) || typeof allocationSeed !== 'string' || allocationSeed.length < 16 || allocationSeed.length > 128) throw new Error('Participant index and preregistered allocation seed required');
  const block = Math.floor(participantIndex / 6);
  const shuffled = STUDY_ORDERS.map((order, i) => ({order, hash: createHash('sha256').update(`${allocationSeed}:${block}:${i}`).digest('hex')})).sort((a, b) => a.hash.localeCompare(b.hash));
  return [...shuffled[participantIndex % 6].order];
}

export function validateStudyRecord(record) {
  if (!record || record.schemaVersion !== 1 || record.protocolVersion !== STUDY_PROTOCOL || typeof record.participantId !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(record.participantId)) throw new Error('Invalid study record identity or protocol');
  if (record.kind === 'withdrawal') {
    if (!allowedKeys(record, ['schemaVersion', 'protocolVersion', 'participantId', 'kind'])) throw new Error('Unexpected withdrawal fields');
    return record;
  }
  if (!allowedKeys(record, ['schemaVersion', 'protocolVersion', 'participantId', 'kind', 'source', 'consentVersion', 'consented', 'surface', 'benchmarkRevision', 'allocationIndex', 'allocationSeed', 'orderIndex', 'repeatIndex', 'device', 'accessibilityGroups', 'attempts', 'wallDurationMs', 'withdrawalTokenHash', 'fallback', 'excludedReason'])) throw new Error('Unexpected participant fields: never collect contact, IP or biometrics here');
  if (record.kind !== 'trial' || !['human', 'automation', 'fixture'].includes(record.source) || record.consentVersion !== CONSENT_VERSION || record.consented !== true || !STUDY_SURFACES.includes(record.surface) || record.benchmarkRevision !== 'kechap-toy-replay-v1') throw new Error('Missing consent, source or supported surface');
  if (!boundedInteger(record.allocationIndex, 0, 999999) || typeof record.allocationSeed !== 'string' || !boundedInteger(record.orderIndex, 0, 2) || !boundedInteger(record.repeatIndex, 0, 2) || studyAssignment(record.allocationIndex, record.allocationSeed)[record.orderIndex] !== record.surface) throw new Error('Trial order does not match preregistered assignment');
  if (!DEVICES.includes(record.device) || !Array.isArray(record.accessibilityGroups) || record.accessibilityGroups.length > ACCESS.length || record.accessibilityGroups.some(group => !ACCESS.includes(group)) || new Set(record.accessibilityGroups).size !== record.accessibilityGroups.length) throw new Error('Invalid coarse device/accessibility groups');
  if (!HEX64.test(record.withdrawalTokenHash) || !Number.isFinite(record.wallDurationMs) || record.wallDurationMs < 0 || record.wallDurationMs > 60000) throw new Error('Withdrawal token hash and bounded observed wall duration required');
  if (!Array.isArray(record.attempts) || record.attempts.length < 1 || record.attempts.length > 2) throw new Error('The same maximum two-attempt budget applies to every surface');
  for (const [i, attempt] of record.attempts.entries()) {
    if (!allowedKeys(attempt, ['outcome', 'durationMs', 'groundTruth', 'verifierCpuMs', 'costUsd']) || !OUTCOMES.includes(attempt.outcome) || !GROUND_TRUTH.includes(attempt.groundTruth) || !Number.isFinite(attempt.durationMs) || attempt.durationMs < 0 || attempt.durationMs > 15000 || (i < record.attempts.length - 1 && ['success', 'dropout'].includes(attempt.outcome))) throw new Error('Invalid attempt sequence or timing');
    for (const field of ['verifierCpuMs', 'costUsd']) if (attempt[field] !== null && (!Number.isFinite(attempt[field]) || attempt[field] < 0 || attempt[field] > (field === 'costUsd' ? 1000 : 15000))) throw new Error('Measured cost must be a bounded number or null, never invented');
  }
  if (record.attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0) > record.wallDurationMs) throw new Error('Observed task wall duration cannot be shorter than attempt durations');
  if (record.fallback !== null && (!allowedKeys(record.fallback, ['offered', 'used', 'completed', 'assurance']) || !['offered', 'used', 'completed'].every(k => typeof record.fallback[k] === 'boolean') || (record.fallback.completed && !record.fallback.used) || (record.fallback.used && !record.fallback.offered) || !['automation-cost', 'bot-mitigation', 'interaction', 'account-continuity', 'liveness', 'identity', 'uniqueness'].includes(record.fallback.assurance))) throw new Error('Fallback data must keep its actual assurance explicit');
  if (record.excludedReason !== null && !['technical-logging-failure', 'duplicate-session', 'protocol-violation'].includes(record.excludedReason)) throw new Error('Unknown exclusion reason; never exclude ordinary failures or slow users');
  return record;
}

function aggregate(rows) {
  const completed = rows.filter(row => row.attempts.some(attempt => attempt.outcome === 'success'));
  const droppedOut = rows.filter(row => row.attempts.at(-1).outcome === 'dropout').length;
  const attempts = rows.flatMap(row => row.attempts);
  const knownValid = attempts.filter(attempt => attempt.groundTruth === 'valid-interaction');
  const validDecisions = knownValid.filter(attempt => ['success', 'rejected'].includes(attempt.outcome));
  const falseRejects = validDecisions.filter(attempt => attempt.outcome === 'rejected').length;
  const cpu = attempts.map(attempt => attempt.verifierCpuMs).filter(v => v !== null);
  const cost = attempts.map(attempt => attempt.costUsd).filter(v => v !== null);
  const offered = rows.filter(row => row.fallback?.offered), used = offered.filter(row => row.fallback.used), recovered = used.filter(row => row.fallback.completed);
  return {
    participants: rows.length, completed: completed.length, completionRate: rows.length ? completed.length / rows.length : null, completionWilson95: wilson95(completed.length, rows.length),
    droppedOut, dropoutRate: rows.length ? droppedOut / rows.length : null,
    completionWallMs: {median: percentile(completed.map(row => row.wallDurationMs), 0.5), p95: percentile(completed.map(row => row.wallDurationMs), 0.95)},
    attempts: attempts.length, outcomes: Object.fromEntries(OUTCOMES.map(outcome => [outcome, attempts.filter(attempt => attempt.outcome === outcome).length])),
    adjudicatedValidAttempts: knownValid.length, falseRejectEligibleDecisions: validDecisions.length, falseRejects, falseRejectRate: validDecisions.length ? falseRejects / validDecisions.length : null,
    verifierCpuMs: {observedAttempts: cpu.length, median: percentile(cpu, 0.5), p95: percentile(cpu, 0.95)},
    observedCostUsd: cost.length === attempts.length && attempts.length ? cost.reduce((a, b) => a + b, 0) : null,
    fallback: {offered: offered.length, used: used.length, completed: recovered.length, completionRateAmongUsers: used.length ? recovered.length / used.length : null, assuranceCategories: [...new Set(used.map(row => row.fallback.assurance))]},
  };
}

export function analyzeStudy(records, {minimumCellSize = 5} = {}) {
  if (!Array.isArray(records) || records.length > 100000 || !boundedInteger(minimumCellSize, 5, 100)) throw new Error('Bounded records and privacy cell size >=5 required');
  records.forEach(validateStudyRecord);
  const withdrawn = new Set(records.filter(row => row.kind === 'withdrawal').map(row => row.participantId));
  const trialRows = records.filter(row => row.kind === 'trial');
  const human = trialRows.filter(row => row.source === 'human' && !withdrawn.has(row.participantId));
  const unique = new Set(), allocations = new Map(), assignedIndices = new Map();
  for (const row of human) {
    const key = `${row.participantId}:${row.surface}:${row.repeatIndex}`;
    if (unique.has(key)) throw new Error('Duplicate participant/surface/repeat record: resolve before analysis');
    unique.add(key);
    const signature = JSON.stringify([row.allocationIndex, row.allocationSeed, row.device, [...row.accessibilityGroups].sort()]);
    if (allocations.has(row.participantId) && allocations.get(row.participantId) !== signature) throw new Error('Participant allocation/device grouping changed; resolve protocol records before analysis');
    allocations.set(row.participantId, signature);
    const assignedTo = assignedIndices.get(row.allocationIndex);
    if (assignedTo !== undefined && assignedTo !== row.participantId) throw new Error('An allocation index is assigned to multiple participants');
    assignedIndices.set(row.allocationIndex, row.participantId);
  }
  const excluded = human.filter(row => row.excludedReason !== null);
  const primary = human.filter(row => row.repeatIndex === 0 && row.excludedReason === null);
  const primaryIds = new Set(primary.map(row => row.participantId));
  const missing = [...primaryIds].filter(id => primary.filter(row => row.participantId === id).length !== 3).length;
  const privacyAggregate = rows => rows.length < minimumCellSize ? {suppressed: true, reason: `Fewer than ${minimumCellSize} participant records`} : aggregate(rows);
  return {
    schemaVersion: 1, reportType: 'human-study-aggregate', protocolVersion: STUDY_PROTOCOL,
    generatedAt: new Date().toISOString(), dataProvenance: 'Source labels and consent are supplied by the study operator; this tool does not prove humanity, consent authenticity or recruitment independence.',
    humanParticipants: primaryIds.size, humanTrialRecords: primary.length, incompleteParticipants: missing,
    exclusions: {nonHumanRecords: trialRows.filter(row => row.source !== 'human').length, withdrawnParticipants: withdrawn.size, excludedRecords: excluded.length, reasons: Object.fromEntries(['technical-logging-failure', 'duplicate-session', 'protocol-violation'].map(reason => [reason, excluded.filter(row => row.excludedReason === reason).length]))},
    minimumCellSize,
    primary: Object.fromEntries(STUDY_SURFACES.map(surface => [surface, privacyAggregate(primary.filter(row => row.surface === surface))])),
    devices: Object.fromEntries(DEVICES.map(device => [device, Object.fromEntries(STUDY_SURFACES.map(surface => [surface, privacyAggregate(primary.filter(row => row.surface === surface && row.device === device))]))])),
    accessibilityGroups: Object.fromEntries(ACCESS.map(group => [group, Object.fromEntries(STUDY_SURFACES.map(surface => [surface, privacyAggregate(primary.filter(row => row.surface === surface && row.accessibilityGroups.includes(group)))]))])),
    repeatRecords: human.filter(row => row.repeatIndex > 0 && row.excludedReason === null).length,
    statisticsNotes: ['Primary denominator is one participant per surface, first scored presentation, maximum two attempts.', 'Repeated practice and retests are not independent human samples and are not pooled into completion confidence intervals.', 'Wilson intervals are descriptive per-surface participant proportions; groups overlap and between-surface comparisons require participant-cluster analysis.', 'False reject means rejected independently adjudicated valid interaction among attempts with an actual success/rejected decision; unreviewed attempts, infrastructure errors and dropout are not verifier decisions and are separately counted.', 'Completion times include successful task wall time including retry; failures and dropout stay in completion denominators.', 'Missing costs and unmeasured fallback remain null or explicit counts; fixture and automation records never count as humans.'],
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const [input, output = '.local/study/report.json'] = process.argv.slice(2);
    if (!input) throw new Error('Usage: node scripts/analyze-study.js <private-records.jsonl> [aggregate-report.json]');
    const raw = await readFile(input, 'utf8');
    if (Buffer.byteLength(raw) > 33554432) throw new Error('Input exceeds 32MiB analysis limit');
    const records = raw.split(/\r?\n/).filter(line => line.trim()).map((line, i) => {try {return JSON.parse(line);} catch {throw new Error(`Invalid JSON on line ${i + 1}`);}});
    const report = analyzeStudy(records);
    report.inputSha256 = createHash('sha256').update(raw).digest('hex');
    await mkdir(dirname(resolve(output)), {recursive: true});
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log(`Aggregate saved: ${report.humanParticipants} declared human participants; ${report.exclusions.nonHumanRecords} non-human records excluded. No participant IDs exported.`);
  } catch (error) {console.error(error.message); process.exitCode = 1;}
}
