import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {analyzeStudy, validateStudyRecord, studyAssignment, STUDY_SURFACES, STUDY_PROTOCOL, CONSENT_VERSION, wilson95} from '../scripts/analyze-study.js';
import {automationCard, buildLeaderboard, comparableDigest} from '../scripts/leaderboard.js';

// Synthetic fixtures are confined to tests; no file is presented as participant data.
const allocationSeed = 'test-fixture-allocation-v1';
function trial(index, surface, patch = {}) {
  return {
    schemaVersion: 1, protocolVersion: STUDY_PROTOCOL, kind: 'trial',
    participantId: `fixture-person-${String(index).padStart(4, '0')}`,
    source: 'fixture', consentVersion: CONSENT_VERSION, consented: true,
    surface, benchmarkRevision: 'kechap-toy-replay-v1', allocationIndex: index, allocationSeed,
    orderIndex: studyAssignment(index, allocationSeed).indexOf(surface), repeatIndex: 0,
    device: 'desktop', accessibilityGroups: ['keyboard'],
    attempts: [{outcome: 'success', durationMs: 1000, groundTruth: 'unreviewed', verifierCpuMs: 0.2, costUsd: null}],
    wallDurationMs: 1200, withdrawalTokenHash: 'a'.repeat(64), fallback: null, excludedReason: null,
    ...patch,
  };
}
test('six-order block assignment is balanced, stable and bounded', () => {
  const firstBlock = Array.from({length: 6}, (_, i) => studyAssignment(i, allocationSeed));
  assert.equal(new Set(firstBlock.map(order => order.join(':'))).size, 6);
  assert.deepEqual(studyAssignment(1, allocationSeed), studyAssignment(1, allocationSeed));
  assert.throws(() => studyAssignment(-1, allocationSeed));
  assert.throws(() => studyAssignment(0, 'short'));
  assert.equal(firstBlock.flat().length, 18);
});
test('fixture and automation records never create human measurements', () => {
  const records = [trial(0, 'static-choice'), trial(1, 'static-choice', {source: 'automation'})];
  const report = analyzeStudy(records);
  assert.equal(report.humanParticipants, 0);
  assert.equal(report.exclusions.nonHumanRecords, 2);
  assert.equal(report.primary['static-choice'].suppressed, true);
  assert.equal(JSON.stringify(report).includes('fixture-person'), false);
});
test('participant first trial denominator keeps retry, rejection, errors and dropout distinct', () => {
  const records = [];
  for (let i = 0; i < 6; i++) {
    for (const surface of STUDY_SURFACES) records.push(trial(i, surface, {source: 'human'}));
  }
  const rows = records.filter(row => row.surface === 'static-choice');
  rows[0].attempts = [{outcome: 'rejected', durationMs: 300, groundTruth: 'valid-interaction', verifierCpuMs: 0.1, costUsd: 0.01}, {outcome: 'success', durationMs: 700, groundTruth: 'valid-interaction', verifierCpuMs: 0.1, costUsd: 0.01}];
  rows[1].attempts = [{outcome: 'dropout', durationMs: 500, groundTruth: 'unreviewed', verifierCpuMs: null, costUsd: null}];
  rows[2].attempts = [{outcome: 'error', durationMs: 500, groundTruth: 'valid-interaction', verifierCpuMs: 0.1, costUsd: null}];
  records.push(trial(0, 'static-choice', {source: 'human', repeatIndex: 1}));
  const report = analyzeStudy(records);
  const primary = report.primary['static-choice'];
  assert.equal(report.humanParticipants, 6);
  assert.equal(report.humanTrialRecords, 18);
  assert.equal(report.repeatRecords, 1);
  assert.equal(primary.participants, 6); assert.equal(primary.completed, 4);
  assert.equal(primary.droppedOut, 1); assert.equal(primary.outcomes.error, 1);
  assert.equal(primary.adjudicatedValidAttempts, 3); assert.equal(primary.falseRejectEligibleDecisions, 2); assert.equal(primary.falseRejects, 1); assert.equal(primary.falseRejectRate, 1 / 2);
  assert.equal(primary.observedCostUsd, null);
  assert.equal(primary.completionWallMs.median, 1200); assert.equal(primary.completionWallMs.p95, 1200);
  assert.ok(primary.completionWilson95.low < 4 / 6 && primary.completionWilson95.high > 4 / 6);
  assert.equal(report.incompleteParticipants, 0);
  assert.equal(JSON.stringify(report).includes('fixture-person'), false);
});
test('withdrawal removes all participant records and tiny groups stay suppressed', () => {
  const rows = Array.from({length: 6}, (_, i) => trial(i, 'static-choice', {source: 'human'}));
  rows.push({schemaVersion: 1, protocolVersion: STUDY_PROTOCOL, kind: 'withdrawal', participantId: rows[0].participantId});
  const report = analyzeStudy(rows);
  assert.equal(report.humanParticipants, 5); assert.equal(report.exclusions.withdrawnParticipants, 1);
  assert.equal(report.primary['static-choice'].participants, 5);
  assert.equal(report.primary['drag-rotate'].suppressed, true);
  assert.equal(report.devices.mobile['static-choice'].suppressed, true);
  assert.equal(report.incompleteParticipants, 5);
});
test('invalid raw fields, attempt budgets, assignments and duplicates are rejected', () => {
  const good = trial(0, 'static-choice');
  assert.equal(validateStudyRecord(good), good);
  assert.throws(() => validateStudyRecord({...good, ip: 'do not collect'}));
  assert.throws(() => validateStudyRecord({...good, consented: false}));
  assert.throws(() => validateStudyRecord({...good, attempts: [...good.attempts, ...good.attempts, ...good.attempts]}));
  assert.throws(() => validateStudyRecord({...good, wallDurationMs: 1}));
  assert.throws(() => validateStudyRecord({...good, orderIndex: (good.orderIndex + 1) % 3}));
  const human = {...good, source: 'human'};
  assert.throws(() => analyzeStudy([human, structuredClone(human)]), /Duplicate/);
  assert.throws(() => analyzeStudy([{...human, excludedReason: 'slow-user'}]));
  assert.throws(() => analyzeStudy([], {minimumCellSize: 1}));
});
test('zero denominators and unknown adjudication are not false measurements', () => {
  assert.equal(wilson95(0, 0), null);
  assert.equal(wilson95(0, 1).low, 0);
  const report = analyzeStudy(Array.from({length: 5}, (_, i) => trial(i, 'static-choice', {source: 'human'})));
  assert.equal(report.primary['static-choice'].falseRejectRate, null);
  assert.throws(() => wilson95(2, 1));
});

async function actualAutomationCard() {
  const raw = await readFile(new URL('../benchmarks/results/2026-11-12-toy-baseline.json', import.meta.url));
  const report = JSON.parse(raw);
  return automationCard(report, {id: 'owned-baseline-v1', codeUrl: 'https://github.com/NomaDamas/Kechap', commit: 'a'.repeat(40), artifactUrl: 'https://github.com/NomaDamas/Kechap/blob/main/benchmarks/results/2026-11-12-toy-baseline.json', artifactSha256: createHash('sha256').update(raw).digest('hex'), submitter: 'kechap-maintainers', reviewAfter: '2027-01-01T00:00:00Z'});
}
test('actual script artifact becomes automation-only card with no fabricated human score', async () => {
  const card = await actualAutomationCard();
  const board = buildLeaderboard([card], {now: Date.parse('2026-12-01')});
  assert.equal(board.rank, null);
  assert.equal(board.rows[0].category, 'owned-automation');
  assert.equal(board.rows[0].verified, false);
  assert.equal(board.rows[0].reproductionStatus, 'not-independently-reproduced');
  assert.equal(card.humanResults, null); assert.equal(card.vlmResults, null);
  assert.equal(card.split.kind, 'public-development');
});
test('reproduction declaration requires matching digest but never authenticates reviewer identity', async () => {
  const card = await actualAutomationCard();
  const base = {reviewer: 'other-reviewer', evidenceUrl: 'https://example.org/reproduction', artifactSha256: 'b'.repeat(64), reviewedAt: '2026-12-01T00:00:00Z', comparableDigest: comparableDigest(card), result: 'matched'};
  card.reproductions.push(base);
  let result = buildLeaderboard([card], {now: Date.parse('2026-12-02')}).rows[0];
  assert.equal(result.reproductionStatus, 'independent-evidence-attached'); assert.equal(result.verified, false);
  card.reproductions[0].reviewer = card.provenance.submitter;
  result = buildLeaderboard([card], {now: Date.parse('2026-12-02')}).rows[0];
  assert.equal(result.reproductionStatus, 'not-independently-reproduced');
  card.reproductions[0].reviewer = 'other-reviewer'; card.reproductions[0].comparableDigest = 'c'.repeat(64);
  assert.equal(buildLeaderboard([card], {now: Date.parse('2026-12-02')}).rows[0].independentEvidenceCount, 0);
});
test('stale, superseded and retracted results stay visible but cannot count as current comparisons', async () => {
  const card = await actualAutomationCard();
  assert.equal(buildLeaderboard([card], {now: Date.parse('2028-01-01')}).rows[0].eligibleForComparison, false);
  for (const state of ['superseded', 'retracted']) {
    card.state = state; card.lifecycleReason = 'New revision or invalid evidence';
    const board = buildLeaderboard([card], {now: Date.parse('2026-12-01')});
    assert.equal(board.rows.length, 1); assert.equal(board.rows[0].eligibleForComparison, false);
  }
  assert.throws(() => buildLeaderboard([{...card, lifecycleReason: ''}]));
  card.state = 'active';card.humanResults = {completion: 1};
  assert.throws(() => buildLeaderboard([card]), /must not invent/);
});
