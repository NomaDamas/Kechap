import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, resolve, relative} from 'node:path';
import {pathToFileURL} from 'node:url';

const HASH = /^[a-f0-9]{64}$/;
const CATEGORIES = ['owned-automation', 'human-pilot'];
const STATES = ['active', 'superseded', 'retracted'];
const isoTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const https = value => {try {return new URL(value).protocol === 'https:';} catch {return false;}};
const canonical = value => JSON.stringify(value);

export function validateResultCard(card) {
  if (!card || card.schemaVersion !== 1 || !/^[a-z0-9-]{3,80}$/.test(card.id) || typeof card.benchmarkRevision !== 'string' || !card.benchmarkRevision || !CATEGORIES.includes(card.category) || !STATES.includes(card.state)) throw new Error('Invalid result card identity, revision, category or lifecycle');
  if (!isoTime(card.createdAt) || !isoTime(card.reviewAfter) || Date.parse(card.reviewAfter) <= Date.parse(card.createdAt)) throw new Error('Creation and future review deadline required');
  if (!card.split || !['public-development', 'sealed-holdout'].includes(card.split.kind) || !HASH.test(card.split.seedSetSha256) || typeof card.split.datasetVersion !== 'string' || !card.split.datasetVersion) throw new Error('Versioned split and seed-set digest required');
  if (!card.provenance || !https(card.provenance.codeUrl) || !/^[a-f0-9]{40}$/.test(card.provenance.commit) || !HASH.test(card.provenance.artifactSha256) || !https(card.provenance.artifactUrl) || typeof card.provenance.environment !== 'string' || !card.provenance.environment || typeof card.provenance.submitter !== 'string' || !card.provenance.submitter) throw new Error('Pinned code, artifact hash/URL, environment and submitter required');
  if (!Array.isArray(card.limitations) || !card.limitations.length || card.limitations.some(item => typeof item !== 'string' || !item)) throw new Error('Result limitations required');
  if (card.state !== 'active' && (typeof card.lifecycleReason !== 'string' || !card.lifecycleReason)) throw new Error('Superseded or retracted result requires a reason');
  if (card.category === 'owned-automation') {
    if (!Array.isArray(card.runs) || !card.runs.length || card.runs.length > 100 || !card.sourceSha256 || !HASH.test(card.sourceSha256.replay) || !HASH.test(card.sourceSha256.benchmark)) throw new Error('Automation runs and executable source hashes required');
    const keys = new Set();
    for (const run of card.runs) {
      if (!['static-choice', 'drag-rotate', 'dynamic-sequence'].includes(run.surface) || typeof run.baseline !== 'string' || !/^[a-z0-9-]{1,64}$/.test(run.baseline) || !Number.isInteger(run.samples) || run.samples < 1 || run.samples > 1000000 || !Number.isInteger(run.successes) || run.successes < 0 || run.successes > run.samples || !HASH.test(run.inputDigest)) throw new Error('Invalid automation measurement');
      const key = `${run.surface}:${run.baseline}`;
      if (keys.has(key)) throw new Error('Duplicate surface/baseline run'); keys.add(key);
    }
    if (card.humanResults !== null || card.vlmResults !== null || card.accessibilityResults !== null) throw new Error('Owned automation card must not invent human, VLM or accessibility results');
  } else {
    if (card.protocolVersion !== 'kechap-human-pilot-v1' || !Number.isInteger(card.humanParticipants) || card.humanParticipants < 1 || !https(card.consentProtocolUrl) || !HASH.test(card.aggregateSha256) || !Array.isArray(card.metrics) || card.metrics.length !== 3) throw new Error('Human pilot requires real aggregate count, consent protocol and versioned metrics');
    for (const row of card.metrics) if (!['static-choice', 'drag-rotate', 'dynamic-sequence'].includes(row.surface) || !Number.isInteger(row.participants) || row.participants < 5 || !Number.isInteger(row.completed) || row.completed < 0 || row.completed > row.participants) throw new Error('Human metrics require unsuppressed participant denominators');
    if (new Set(card.metrics.map(row => row.surface)).size !== 3) throw new Error('Each surface needs a distinct human metric');
  }
  if (!Array.isArray(card.reproductions) || card.reproductions.length > 20) throw new Error('Reproduction evidence list required');
  for (const replication of card.reproductions) if (!replication || typeof replication.reviewer !== 'string' || !replication.reviewer || !https(replication.evidenceUrl) || !HASH.test(replication.artifactSha256) || !HASH.test(replication.comparableDigest) || !isoTime(replication.reviewedAt) || !['matched', 'mismatch', 'not-reviewed'].includes(replication.result)) throw new Error('Incomplete reproduction evidence');
  return card;
}

export function comparableDigest(card) {
  validateResultCard({...card, reproductions: card.reproductions ?? []});
  const comparable = card.category === 'owned-automation'
    ? {category: card.category, revision: card.benchmarkRevision, split: card.split, sourceSha256: card.sourceSha256, runs: [...card.runs].map(run => ({surface: run.surface, baseline: run.baseline, samples: run.samples, successes: run.successes, inputDigest: run.inputDigest})).sort((a, b) => `${a.surface}:${a.baseline}`.localeCompare(`${b.surface}:${b.baseline}`))}
    : {category: card.category, revision: card.benchmarkRevision, split: card.split, protocolVersion: card.protocolVersion, aggregateSha256: card.aggregateSha256, humanParticipants: card.humanParticipants, metrics: [...card.metrics].sort((a, b) => a.surface.localeCompare(b.surface))};
  return createHash('sha256').update(canonical(comparable)).digest('hex');
}

export function buildLeaderboard(cards, {now = Date.now()} = {}) {
  if (!Array.isArray(cards) || cards.length > 10000 || !Number.isFinite(now)) throw new Error('Bounded result cards and valid clock required');
  const ids = new Set();
  const rows = cards.map(card => {
    validateResultCard(card);
    if (ids.has(card.id)) throw new Error('Duplicate result-card ID'); ids.add(card.id);
    const digest = comparableDigest(card);
    const evidence = card.reproductions.filter(item => item.result === 'matched' && item.reviewer !== card.provenance.submitter && item.comparableDigest === digest);
    const stale = now > Date.parse(card.reviewAfter);
    return {id: card.id, category: card.category, state: card.state, benchmarkRevision: card.benchmarkRevision, split: card.split, stale,
      reproductionStatus: evidence.length ? 'independent-evidence-attached' : 'not-independently-reproduced',
      verified: false,
      verificationNote: 'Artifact metadata cannot authenticate independent reviewer identity or prove a study happened. Maintainers must verify public evidence before awarding a verified badge.',
      eligibleForComparison: card.state === 'active' && !stale,
      independentEvidenceCount: evidence.length, comparableDigest: digest, provenance: card.provenance,
      metrics: card.category === 'owned-automation' ? card.runs : card.metrics,
      limitations: card.limitations, lifecycleReason: card.lifecycleReason ?? null,
    };
  });
  return {schemaVersion: 1, reportType: 'kechap-evidence-board', generatedAt: new Date(now).toISOString(), rank: null,
    comparisonPolicy: 'No universal human score. Compare only identical revision, split, budgets and category; automation and human UX remain separate.',
    rows, warnings: ['Stale, superseded and retracted cards remain visible but are ineligible for current comparisons.', 'Source labels, submission identity and reproduction claims are not independently authenticated by this renderer.', 'No verified badge is granted without maintainer review of actual independent evidence.']};
}

export function automationCard(report, {id, codeUrl, commit, artifactUrl, artifactSha256, submitter, reviewAfter}) {
  if (report.schemaVersion !== 1 || typeof report.seedScheme !== 'string' || !Array.isArray(report.runs)) throw new Error('Supported actual benchmark report required');
  const card = {schemaVersion: 1, id, category: 'owned-automation', state: 'active', createdAt: report.generatedAt, reviewAfter,
    benchmarkRevision: report.revision, split: {kind: 'public-development', datasetVersion: 'kechap-benchmark-v1', seedSetSha256: createHash('sha256').update(JSON.stringify({scheme: report.seedScheme, samplesBySurface: [...new Map(report.runs.map(run => [run.surface, run.samples]))].sort((a, b) => a[0].localeCompare(b[0]))})).digest('hex')},
    sourceSha256: report.sourceSha256, runs: report.runs, humanResults: report.humanResults, vlmResults: report.vlmResults, accessibilityResults: report.accessibilityResults,
    provenance: {codeUrl, commit, artifactUrl, artifactSha256, submitter, environment: JSON.stringify(report.runtime)},
    reproductions: [], limitations: [report.scope, report.timing, report.securityClaim, 'Public development seeds; no sealed holdout or independent reproduction.']};
  return validateResultCard(card);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const [input, output = '.local/leaderboard.json'] = process.argv.slice(2);
    if (!input) throw new Error('Usage: node scripts/leaderboard.js <result-cards.json> [board.json]');
    const raw = await readFile(input, 'utf8');
    if (Buffer.byteLength(raw) > 33554432) throw new Error('Cards exceed 32MiB input limit');
    const result = buildLeaderboard(JSON.parse(raw));
    await mkdir(dirname(resolve(output)), {recursive: true});
    if (relative(resolve(input), resolve(output)) === '') throw new Error('Refusing to overwrite submitted result cards');
    await writeFile(output, JSON.stringify(result, null, 2) + '\n');
    console.log(`${result.rows.length} result cards rendered; no fabricated scores or verified badges.`);
  } catch (error) {console.error(error.message); process.exitCode = 1;}
}
