import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import Ajv from 'ajv';

const schema = JSON.parse(await readFile(new URL('../benchmarks/pilot.schema.json', import.meta.url)));
const validate = new Ajv({allErrors: true, strict: true, allowUnionTypes: true}).compile(schema);
const rate = (numerator, denominator) => numerator === null || denominator === null || denominator === 0 ? null : numerator / denominator;
const sumKnown = values => values.some(v => v === null) ? null : values.reduce((a, b) => a + b, 0);
const relativeChange = (before, after) => before === null || after === null || before === 0 ? null : (after - before) / before;
const validDate = value => {
  if (!Number.isFinite(Date.parse(value))) return false;
  const normalized = value.includes('.') ? value.replace(/\.(\d{1,3})Z$/, (_, fraction) => '.' + fraction.padEnd(3, '0') + 'Z') : value.replace('Z', '.000Z');
  return new Date(value).toISOString() === normalized;
};

function checkWindow(window, name) {
  if (!validDate(window.startsAt) || !validDate(window.endsAt) || Date.parse(window.startsAt) >= Date.parse(window.endsAt)) throw new Error(`${name}: invalid or non-increasing measurement window`);
  if (window.completedActions !== null && window.eligibleRequests !== null && window.completedActions > window.eligibleRequests) throw new Error(`${name}: completed actions exceed eligible requests`);
  if (window.confirmedAbusiveActions !== null && window.completedActions !== null && window.confirmedAbusiveActions > window.completedActions) throw new Error(`${name}: abusive actions exceed completed actions`);
}

function measurements(window) {
  const observedDays = (Date.parse(window.endsAt) - Date.parse(window.startsAt)) / 86400000;
  const totalCostUsd = sumKnown([window.providerCostUsd, window.infrastructureCostUsd]);
  return {
    observedDays,
    eligibleRequests: window.eligibleRequests,
    completedActions: window.completedActions,
    confirmedAbusiveActions: window.confirmedAbusiveActions,
    completionRate: rate(window.completedActions, window.eligibleRequests),
    confirmedAbusePerEligibleRequest: rate(window.confirmedAbusiveActions, window.eligibleRequests),
    confirmedAbusePerCompletedAction: rate(window.confirmedAbusiveActions, window.completedActions),
    supportTickets: window.supportTickets,
    supportTicketsPerEligibleRequest: rate(window.supportTickets, window.eligibleRequests),
    providerCostUsd: window.providerCostUsd,
    infrastructureCostUsd: window.infrastructureCostUsd,
    totalCostUsd,
    totalCostPer1000EligibleRequests: totalCostUsd === null ? null : rate(totalCostUsd * 1000, window.eligibleRequests),
    installationHours: window.installationHours,
    maintenanceHours: window.maintenanceHours,
  };
}

function compare(operator) {
  const baseline = measurements(operator.baseline), intervention = measurements(operator.intervention);
  const warnings = [];
  const flags = operator.comparability;
  for (const key of ['sameProtectedAction', 'sameAbuseDefinition', 'sameTrafficInclusion', 'externalChangesControlled']) if (flags[key] !== true) warnings.push(`comparison-${key}-not-established`);
  const durationRatio = intervention.observedDays / baseline.observedDays;
  if (durationRatio < 0.9 || durationRatio > 1.1) warnings.push('measurement-window-duration-differs-more-than-10-percent');
  if (flags.assignment === 'sequential-observational' && Date.parse(operator.baseline.endsAt) > Date.parse(operator.intervention.startsAt)) warnings.push('sequential-windows-overlap');
  if (flags.assignment === 'randomized-concurrent' && (Date.parse(operator.baseline.startsAt) !== Date.parse(operator.intervention.startsAt) || Date.parse(operator.baseline.endsAt) !== Date.parse(operator.intervention.endsAt))) warnings.push('concurrent-assignment-windows-do-not-match');
  if ([baseline.eligibleRequests, intervention.eligibleRequests].some(v => v === null || v === 0)) warnings.push('traffic-denominator-missing-or-zero');
  if ([baseline.completionRate, intervention.completionRate, baseline.confirmedAbusePerEligibleRequest, intervention.confirmedAbusePerEligibleRequest, baseline.totalCostUsd, intervention.totalCostUsd, baseline.supportTickets, intervention.supportTickets, intervention.installationHours, intervention.maintenanceHours].some(v => v === null)) warnings.push('required-outcome-or-cost-data-missing');
  if (operator.status === 'active') warnings.push('pilot-not-finished');
  if (operator.willingnessToPay.askedAt === null) warnings.push('operator-interview-not-conducted');
  const comparable = warnings.length === 0;
  return {
    operatorId: operator.operatorId, productType: operator.productType,
    status: operator.status, cancellationReason: operator.cancellationReason,
    assignment: flags.assignment, comparable, warnings,
    baseline, intervention,
    deltas: comparable ? {
      completionRatePercentagePoints: (intervention.completionRate - baseline.completionRate) * 100,
      abusePerEligibleRequestRelativeChange: relativeChange(baseline.confirmedAbusePerEligibleRequest, intervention.confirmedAbusePerEligibleRequest),
      supportPerEligibleRequestRelativeChange: relativeChange(baseline.supportTicketsPerEligibleRequest, intervention.supportTicketsPerEligibleRequest),
      totalCostPer1000RequestsChangeUsd: intervention.totalCostPer1000EligibleRequests - baseline.totalCostPer1000EligibleRequests,
    } : null,
    failures: operator.failures,
    willingnessToPay: {...operator.willingnessToPay, meaning: 'Stated interview response, not purchase, revenue or causal evidence'},
    independentReviewConfirmed: operator.provenance.independentlyReviewed,
    causalClaim: 'None. Window matching and consent do not establish causal attribution; randomized designs require separate registered analysis.',
  };
}

/** Excludes fixtures, withdrawn consent and unreviewed provenance from real results. */
export function analyzePilots(input, {now = () => new Date().toISOString()} = {}) {
  if (!validate(input)) throw new Error(`Pilot input schema invalid: ${JSON.stringify(validate.errors)}`);
  const ids = new Set(), exclusions = [];
  const measured = [];
  let fixtureCount = 0;
  for (const operator of input.operators) {
    if (ids.has(operator.operatorId)) throw new Error('Duplicate anonymous operator identifier');
    ids.add(operator.operatorId);
    checkWindow(operator.baseline, 'baseline'); checkWindow(operator.intervention, 'intervention');
    for (const time of [operator.consent.recordedAt, operator.consent.withdrawnAt, operator.willingnessToPay.askedAt].filter(Boolean)) if (!validDate(time)) throw new Error('Invalid consent/interview timestamp');
    if (operator.status === 'withdrawn' && operator.consent.withdrawnAt === null) throw new Error('Withdrawn status requires recorded withdrawal');
    if (operator.status === 'terminated' && operator.cancellationReason === null) throw new Error('Terminated pilot requires a coded cancellation reason');
    if (operator.willingnessToPay.monthlyUsd !== null && operator.willingnessToPay.askedAt === null) throw new Error('Stated willingness-to-pay requires interview time');
    if (operator.source !== 'real-operator') {fixtureCount++; continue;}
    if (!operator.consent.granted || operator.consent.withdrawnAt !== null || operator.status === 'withdrawn') {exclusions.push({operatorId: operator.operatorId, reason: 'no-current-consent'}); continue;}
    if (Date.parse(operator.consent.recordedAt) > Date.parse(operator.baseline.startsAt)) {exclusions.push({operatorId: operator.operatorId, reason: 'consent-not-established-before-measurement'}); continue;}
    if (!operator.provenance.reportSha256 || !operator.provenance.independentlyReviewed) {exclusions.push({operatorId: operator.operatorId, reason: 'reviewed-provenance-missing'}); continue;}
    measured.push(compare(operator));
  }
  const comparable = measured.filter(record => record.comparable);
  const productTypes = [...new Set(comparable.map(record => record.productType))];
  const enough = comparable.length >= 5 && productTypes.length >= 5;
  const aggregateWindow = name => {
    const windows = comparable.map(operator => operator[name]);
    const eligibleRequests = sumKnown(windows.map(v => v.eligibleRequests));
    const completedActions = sumKnown(windows.map(v => v.completedActions));
    const confirmedAbusiveActions = sumKnown(windows.map(v => v.confirmedAbusiveActions));
    const supportTickets = sumKnown(windows.map(v => v.supportTickets));
    const totalCostUsd = sumKnown(windows.map(v => v.totalCostUsd));
    return {eligibleRequests, completedActions, confirmedAbusiveActions, supportTickets, totalCostUsd, completionRate: rate(completedActions, eligibleRequests), abusePerEligibleRequest: rate(confirmedAbusiveActions, eligibleRequests), supportTicketsPerEligibleRequest: rate(supportTickets, eligibleRequests), totalCostPer1000Requests: totalCostUsd === null ? null : rate(totalCostUsd * 1000, eligibleRequests)};
  };
  return {
    schemaVersion: 1, studyRevision: input.studyRevision, generatedAt: now(),
    status: enough ? 'reviewed-pilot-aggregates-available' : 'insufficient-real-comparable-pilots',
    minimumOperators: 5, minimumDistinctProductTypes: 5,
    recordsReceived: input.operators.length, fixtureOrSyntheticExcluded: fixtureCount,
    realConsentingReviewedOperators: measured.length, comparableOperators: comparable.length,
    distinctComparableProductTypes: productTypes, exclusions,
    operators: measured,
    aggregate: enough ? {baseline: aggregateWindow('baseline'), intervention: aggregateWindow('intervention')} : null,
    revenueUsd: null, willingnessToPayMeaning: 'Operator-stated only; not revenue or customer conversion.',
    securityClaim: 'None. Operational pilot data is descriptive and must not be represented as a security audit or personhood proof.',
    privacy: 'Input and report accept anonymous operator IDs and aggregate counts only; no user events, names, emails, IPs, free-text interviews or raw biometrics.',
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const [source, output] = process.argv.slice(2);
    if (!source) throw new Error('Usage: node scripts/analyze-pilots.js <aggregate-input.json> [report.json]');
    const input = JSON.parse(await readFile(resolve(source), 'utf8'));
    const report = analyzePilots(input);
    if (output) {await mkdir(dirname(resolve(output)), {recursive: true}); await writeFile(resolve(output), JSON.stringify(report, null, 2) + '\n');}
    else process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } catch (error) {console.error(error.message); process.exitCode = 1;}
}
