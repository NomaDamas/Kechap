import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePilots} from '../scripts/analyze-pilots.js';

// Every record below is a test fixture, including temporary source-label mutations.
// No file from these tests is published as a real operator report.
const window = (start, end, intervention = false) => ({startsAt: start, endsAt: end, eligibleRequests: 1000, completedActions: intervention ? 900 : 800, confirmedAbusiveActions: intervention ? 10 : 20, supportTickets: intervention ? 5 : 10, providerCostUsd: intervention ? 4 : 3, infrastructureCostUsd: 2, installationHours: intervention ? 2 : 0, maintenanceHours: 1});
const record = (n = 0) => ({
  operatorId: `op_${n.toString(16).padStart(16, '0')}`, source: 'fixture',
  productType: ['contact-form', 'community', 'commerce', 'rewards', 'account-recovery'][n % 5],
  consent: {granted: true, version: 'fixture-v1', recordedAt: '2026-01-01T00:00:00Z', withdrawnAt: null},
  provenance: {reportSha256: 'a'.repeat(64), independentlyReviewed: true},
  baseline: window('2026-01-02T00:00:00Z', '2026-01-09T00:00:00Z'),
  intervention: window('2026-01-09T00:00:00Z', '2026-01-16T00:00:00Z', true),
  comparability: {assignment: 'sequential-observational', sameProtectedAction: true, sameAbuseDefinition: true, sameTrafficInclusion: true, externalChangesControlled: true},
  failures: [{kind: 'outage', count: 0}], status: 'completed', cancellationReason: null,
  willingnessToPay: {source: 'operator-stated-not-revenue', monthlyUsd: 10, askedAt: '2026-01-16T00:00:00Z'},
});
const input = operators => ({schemaVersion: 1, studyRevision: 'test-fixture-only', operators});
const now = () => '2026-01-17T00:00:00Z';

test('zero data is explicitly insufficient with null outcomes, not 0% performance', () => {
  const result = analyzePilots(input([]), {now});
  assert.equal(result.status, 'insufficient-real-comparable-pilots');
  assert.equal(result.aggregate, null);
  assert.equal(result.revenueUsd, null);
});
test('fixture and synthetic operators are never counted as real pilots', () => {
  const records = Array.from({length: 10}, (_, n) => record(n));
  records[0].source = 'synthetic';
  const result = analyzePilots(input(records), {now});
  assert.equal(result.fixtureOrSyntheticExcluded, 10);
  assert.equal(result.realConsentingReviewedOperators, 0);
  assert.equal(result.aggregate, null);
  assert.deepEqual(result.operators, []);
});
test('simulated admission branch computes denominators and stated-price values without claiming revenue', () => {
  const fixtures = Array.from({length: 5}, (_, n) => ({...record(n), source: 'real-operator'}));
  const result = analyzePilots(input(fixtures), {now});
  assert.equal(result.comparableOperators, 5);
  assert.equal(result.aggregate.baseline.eligibleRequests, 5000);
  assert.equal(result.aggregate.baseline.completionRate, 0.8);
  assert.equal(result.aggregate.intervention.completionRate, 0.9);
  assert.equal(result.aggregate.intervention.abusePerEligibleRequest, 0.01);
  assert.equal(result.operators[0].deltas.abusePerEligibleRequestRelativeChange, -0.5);
  assert.ok(Math.abs(result.operators[0].deltas.completionRatePercentagePoints - 10) < 1e-8);
  assert.equal(result.revenueUsd, null);
  assert.match(result.operators[0].willingnessToPay.meaning, /not purchase, revenue/);
});
test('consent withdrawal and missing independent provenance exclude real-labeled fixture records', () => {
  const fixtures = Array.from({length: 3}, (_, n) => ({...record(n), source: 'real-operator'}));
  fixtures[0].consent.withdrawnAt = '2026-01-17T00:00:00Z'; fixtures[0].status = 'withdrawn';
  fixtures[1].provenance.reportSha256 = null;
  fixtures[2].consent.recordedAt = '2026-01-03T00:00:00Z';
  const result = analyzePilots(input(fixtures), {now});
  assert.equal(result.realConsentingReviewedOperators, 0);
  assert.equal(result.exclusions.length, 3);
  assert.equal(result.aggregate, null);
});
test('incomparable windows and null metrics do not produce misleading deltas', () => {
  const fixture = {...record(), source: 'real-operator'};
  fixture.intervention.endsAt = '2026-02-20T00:00:00Z';
  fixture.intervention.eligibleRequests = null;
  fixture.intervention.infrastructureCostUsd = null;
  fixture.comparability.sameAbuseDefinition = false;
  const result = analyzePilots(input([fixture]), {now});
  assert.equal(result.operators[0].comparable, false);
  assert.equal(result.operators[0].deltas, null);
  assert.equal(result.operators[0].intervention.totalCostUsd, null);
  assert.ok(result.operators[0].warnings.includes('measurement-window-duration-differs-more-than-10-percent'));
  assert.equal(result.aggregate, null);
});
test('real-labeled fixture failure and cancellation evidence are retained, active and no-interview trials are not complete', () => {
  const fixture = {...record(), source: 'real-operator', status: 'terminated', cancellationReason: 'no-value', failures: [{kind: 'integration', count: 3}]};
  const result = analyzePilots(input([fixture]), {now});
  assert.equal(result.operators[0].cancellationReason, 'no-value');
  assert.equal(result.operators[0].failures[0].count, 3);
  fixture.status = 'active'; fixture.willingnessToPay.askedAt = null; fixture.willingnessToPay.monthlyUsd = null;
  const unfinished = analyzePilots(input([fixture]), {now});
  assert.equal(unfinished.operators[0].comparable, false);
  assert.ok(unfinished.operators[0].warnings.includes('operator-interview-not-conducted'));
});
test('PII fields, duplicate operators, impossible counts and invalid times are rejected', () => {
  for (const mutate of [p => {p.email = 'someone@example.invalid';}, p => {p.operatorId = 'company-real-name';}, p => {p.baseline.completedActions = 1001;}, p => {p.baseline.confirmedAbusiveActions = 900;}, p => {p.baseline.startsAt = '2026-02-30T00:00:00Z';}, p => {p.baseline.endsAt = p.baseline.startsAt;}, p => {p.willingnessToPay.monthlyUsd = -1;}, p => {p.baseline.eligibleRequests = 0.5;}]) {const fixture = record(); mutate(fixture); assert.throws(() => analyzePilots(input([fixture])));}
  assert.throws(() => analyzePilots(input([record(), record()])));
});
