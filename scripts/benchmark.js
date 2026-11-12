import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import {createReplayChallenge, REPLAY_SURFACES, REPLAY_REVISION, replayEvents, oracleEvents, eventStreamHash} from '../src/replay.js';

const samples = Number(process.argv[2] ?? 100);
if (!Number.isInteger(samples) || samples < 1 || samples > 10000) throw new Error('Samples must be 1..10000 per surface per baseline');
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];
const wilson95 = (successes, n) => {
  const z = 1.959963984540054, rate = successes / n, denominator = 1 + z * z / n;
  const center = (rate + z * z / (2 * n)) / denominator;
  const radius = z * Math.sqrt(rate * (1 - rate) / n + z * z / (4 * n * n)) / denominator;
  return {low: Math.max(0, center - radius), high: Math.min(1, center + radius), method: 'Wilson 95%; descriptive for deterministic seed sample, not a population guarantee'};
};
const fixedChallenge = createReplayChallenge({surface: 'drag-rotate', seed: 'fixed-macro', nonce: 'fixed_nonce_1234567890'});
const baselines = {
  'rule-aware-script': challenge => oracleEvents(challenge),
  'fixed-macro': challenge => challenge.surface === 'static-choice' ? [{type: 'choose', t: 500, choice: 0}] : challenge.surface === 'dynamic-sequence' ? [700, 1500, 2300, 3100].map(t => ({type: 'choose', t, choice: 0})) : oracleEvents(fixedChallenge)
};
const report = {
  schemaVersion: 1, revision: REPLAY_REVISION, generatedAt: new Date().toISOString(),
  sourceSha256: {
    replay: createHash('sha256').update(await readFile(new URL('../src/replay.js', import.meta.url))).digest('hex'),
    benchmark: createHash('sha256').update(await readFile(new URL('./benchmark.js', import.meta.url))).digest('hex')
  },
  seedScheme: 'kechap-benchmark-v1:<sample index from zero>; same worlds for each baseline',
  scope: 'Owned toy environments only; no external CAPTCHA services evaluated.',
  timing: 'Client event times and observed elapsed are simulated; verifier CPU elapsed is measured with performance.now().',
  runtime: {node: process.version, platform: process.platform, arch: process.arch, cpuModel: cpus()[0]?.model ?? 'unknown'},
  humanResults: null, headlessBrowserResults: null, vlmResults: null, accessibilityResults: null,
  securityClaim: 'None. Rule-aware automation is expected to pass; replay validates world rules rather than human presence.',
  runs: []
};
for (const surface of REPLAY_SURFACES) {
  for (const [baseline, agent] of Object.entries(baselines)) {
    const costs = [], durations = [], hashes = []; let successes = 0;
    for (let i = 0; i < samples; i++) {
      const challenge = createReplayChallenge({surface, seed: `kechap-benchmark-v1:${i}`, nonce: `bench_nonce_${String(i).padStart(16, '0')}`});
      const events = agent(challenge);
      const response = {nonce: challenge.nonce, events, eventStreamHash: eventStreamHash(events)};
      const before = performance.now();
      const result = replayEvents(challenge, response, {observedElapsedMs: 7000});
      costs.push(performance.now() - before); durations.push(events.at(-1).t); hashes.push(response.eventStreamHash);
      if (result.ok) successes++;
    }
    report.runs.push({surface, baseline, samples, successes, successRate: successes / samples, successRateWilson95: wilson95(successes, samples), verifierMedianMs: percentile(costs, 0.5), verifierP95Ms: percentile(costs, 0.95), simulatedCompletionMedianMs: percentile(durations, 0.5), inputDigest: createHash('sha256').update(hashes.join('\n')).digest('hex')});
  }
}
const output = new URL('../.local/benchmark.json', import.meta.url);
await mkdir(new URL('../.local/', import.meta.url), {recursive: true});
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
