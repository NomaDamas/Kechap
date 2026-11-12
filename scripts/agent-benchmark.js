import {chromium} from 'playwright';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createReplayHarness, interactWithWorld} from './replay-browser-smoke.js';
import {REPLAY_SURFACES, createReplayChallenge, oracleEvents, eventStreamHash} from '../src/replay.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export const AGENT_MODES = ['direct-api', 'fixed-macro', 'headless-dom', 'screenshot-loop', 'gui-agent'];
const MODEL_PROMPT = 'You are evaluating an owned Kechap toy interaction on localhost with explicit authorization. This is not an external CAPTCHA service. Use only what the screenshot shows. Return exactly one JSON object: {"actions":[...]}. Allowed actions: {"type":"click","x":number,"y":number}, {"type":"drag","fromX":number,"fromY":number,"toX":number,"toY":number,"durationMs":number}, {"type":"key","key":"ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Space|Enter|r"}, {"type":"wait","ms":number}. At most 5 actions. Coordinates are screenshot pixels. Do the task as instructed on screen. A correct interaction does not prove human presence. No prose. Never request another site, credentials or tools.';

function extractText(response) {
  if (typeof response.output_text === 'string') return response.output_text;
  return (response.output ?? []).flatMap(item => item.content ?? []).filter(item => item.type === 'output_text').map(item => item.text).join('');
}
export function parseModelActions(text, width = 1100, height = 900) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned);
  if (!parsed || !Array.isArray(parsed.actions) || parsed.actions.length < 1 || parsed.actions.length > 5) throw new Error('Invalid bounded action response');
  const point = (x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x < width && y >= 0 && y < height;
  for (const action of parsed.actions) {
    if (!action || typeof action !== 'object') throw new Error('Invalid action');
    if (action.type === 'click' && point(action.x, action.y)) continue;
    if (action.type === 'drag' && point(action.fromX, action.fromY) && point(action.toX, action.toY) && Number.isInteger(action.durationMs) && action.durationMs >= 300 && action.durationMs <= 1500) continue;
    if (action.type === 'key' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter', 'r'].includes(action.key)) continue;
    if (action.type === 'wait' && Number.isInteger(action.ms) && action.ms >= 0 && action.ms <= 1000) continue;
    throw new Error('Unsupported or unbounded model action');
  }
  return parsed.actions;
}

async function modelConfiguration() {
  let key = process.env.MYPROXY_API_KEY;
  if (!key) {
    // Read only the explicitly authorized MyProxy credential, never execute shell code.
    try {
      const file = await readFile(join(homedir(), '.config/myproxy/codex.env'), 'utf8');
      const raw = /^(?:export\s+)?MYPROXY_API_KEY=(.*)$/m.exec(file)?.[1]?.trim();
      key = raw?.replace(/^(['"])(.*)\1$/, '$2');
    } catch { /* Absent credentials are a missing experimental mode, not a score. */ }
  }
  if (!key) return null;
  const base = process.env.MYPROXY_BASE_URL ?? 'https://proxy.nomadamas.org/v1';
  if (base !== 'https://proxy.nomadamas.org/v1') throw new Error('Research endpoint must be the explicitly authorized MyProxy endpoint');
  return {key, base, model: process.env.MYPROXY_MODEL ?? 'gpt-6.1-sol'};
}

async function requestActions(page, configuration, mode, callIndex) {
  const image = await page.screenshot();
  const text = MODEL_PROMPT + `\nMode: ${mode}. Observation ${callIndex + 1}. The experiment has ALREADY STARTED. Do not click Start experiment or Cancel experiment. Solve the visible tile/drag task directly. Screenshot is current; task expires 7 seconds after it starts. Avoid invented hidden state.` + (mode === 'screenshot-loop' ? ' This mode permits only click and wait actions; no drag or key actions.' : ' This mode permits click, drag, key and wait actions.');
  const started = performance.now();
  const response = await fetch(configuration.base + '/responses', {
    method: 'POST', headers: {'Content-Type': 'application/json', 'User-Agent': 'KechapResearch/0.1', Authorization: `Bearer ${configuration.key}`},
    body: JSON.stringify({model: configuration.model, max_output_tokens: 1024, reasoning: {effort: 'low'}, input: [{role: 'user', content: [{type: 'input_text', text}, {type: 'input_image', image_url: 'data:image/png;base64,' + image.toString('base64')}]}]}),
    signal: AbortSignal.timeout(30000), redirect: 'error',
  });
  if (!response.ok) return {error: `model-http-${response.status}`, elapsedMs: performance.now() - started, usage: null};
  const data = await response.json();
  const usage = data.usage ? {input_tokens: data.usage.input_tokens ?? null, output_tokens: data.usage.output_tokens ?? null, total_tokens: data.usage.total_tokens ?? null, input_tokens_details: data.usage.input_tokens_details ?? null, output_tokens_details: data.usage.output_tokens_details ?? null} : null;
  const record = {elapsedMs: performance.now() - started, usage, prompt: text, promptSha256: createHash('sha256').update(text).digest('hex'), screenshotSha256: createHash('sha256').update(image).digest('hex'), model: data.model ?? configuration.model};
  try {return {...record, actions: parseModelActions(extractText(data))};}
  catch {return {...record, error: 'model-invalid-action-json'};}
}

async function applyActions(page, actions) {
  for (const action of actions) {
    if (action.type === 'click') await page.mouse.click(action.x, action.y);
    if (action.type === 'key') await page.keyboard.press(action.key);
    if (action.type === 'wait') await wait(action.ms);
    if (action.type === 'drag') {
      await page.mouse.move(action.fromX, action.fromY); await page.mouse.down();
      for (let i = 1; i <= 12; i++) {
        await wait(action.durationMs / 12);
        await page.mouse.move(action.fromX + (action.toX - action.fromX) * i / 12, action.fromY + (action.toY - action.fromY) * i / 12);
      }
      await page.mouse.up();
    }
  }
}

async function directTrial(origin, surface, seed, fixed) {
  const started = performance.now();
  const post = async (path, body) => {
    const response = await fetch(origin + path, {method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    return response.json();
  };
  const issued = await post('/challenge', {surface, seed});
  let events = oracleEvents(issued.challenge);
  if (fixed) {
    const fixedWorld = createReplayChallenge({surface, seed: 'fixed-macro-reference'});
    events = oracleEvents(fixedWorld);
    if (surface !== 'drag-rotate') events = events.map(event => ({...event, choice: 0}));
  }
  await wait(Math.max(0, events.at(-1).t + 20 - (performance.now() - started)));
  const result = await post('/verify', {id: issued.id, session: issued.session, response: JSON.stringify({nonce: issued.challenge.nonce, events, eventStreamHash: eventStreamHash(events)})});
  return {accepted: result.ok === true, elapsedMs: performance.now() - started, failure: result.ok ? null : 'server-rejected-interaction', modelCalls: [], timing: 'Real wait before server submission; event schedule declared by scripted baseline'};
}

export async function runAgentBenchmark({samples = 1, includeModel = false, modes = AGENT_MODES} = {}) {
  if (!Number.isInteger(samples) || samples < 1 || samples > 3) throw new Error('samples must be 1..3');
  if (modes.some(mode => !AGENT_MODES.includes(mode))) throw new Error('Unknown benchmark mode');
  const configuration = includeModel ? await modelConfiguration() : null;
  const server = createReplayHarness();
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
  const origin = `http://localhost:${server.address().port}`;
  let browser;
  const report = {schemaVersion: 1, generatedAt: new Date().toISOString(), scope: 'Owned loopback toy worlds only', samplesPerSurface: samples, challengeBudgetMs: 7000, maxModelCallsPerTrial: 3, maxOutputTokensPerCall: 1024, modelTimeoutMs: 30000, dollarCost: null, pricingStatus: 'Unknown; usage tokens and elapsed time are measured, not converted to invented dollar prices', promptTemplate: MODEL_PROMPT, model: configuration?.model ?? null, humanResults: null, independentReplication: false, trials: [], missingModes: []};
  try {
    browser = await chromium.launch({headless: true});report.browser = await browser.version();
    for (const mode of modes) {
      if (['screenshot-loop', 'gui-agent'].includes(mode) && !configuration) {report.missingModes.push({mode, reason: includeModel ? 'No authorized MyProxy credential available' : 'Model calls require explicit --with-model opt-in'});continue;}
      for (const surface of REPLAY_SURFACES) for (let sample = 0; sample < samples; sample++) {
        const seed = `kechap-agent-v1:${surface}:${sample}`;
        let trial;
        if (['direct-api', 'fixed-macro'].includes(mode)) trial = await directTrial(origin, surface, seed, mode === 'fixed-macro');
        else {
          const page = await browser.newPage({viewport: {width: 1100, height: 900}});
          try {
            await page.goto(`${origin}/?surface=${surface}&seed=${encodeURIComponent(seed)}`);
            const started = performance.now();
            if (mode === 'headless-dom') {
              const result = await interactWithWorld(page);
              trial = {accepted: result.result.ok === true, elapsedMs: performance.now() - started, modelCalls: [], failure: result.result.ok ? null : 'server-rejected-interaction', timing: 'Real browser event timestamps, actual pointer and DOM clicks'};
            } else {
              await page.getByRole('button', {name: 'Start experiment', exact: true}).click();
              await page.waitForFunction(() => Boolean(window.__kechapPublicWorld));
              const calls = [];let failure = 'no-accepted-submission';
              // Equal observation/call budget; simple screenshot clicker versus GUI primitives.
              const limit = 3;
              for (let call = 0; call < limit; call++) {
                if (performance.now() - started > 7000) {failure = 'challenge-budget-expired'; break;}
                let output;
                try {output = await requestActions(page, configuration, mode, call);} catch {output = {error: 'model-request-failed-or-timeout', elapsedMs: null, usage: null};}
                calls.push(output);
                if (output.error) {failure = output.error;break;}
                if (mode === 'screenshot-loop' && output.actions.some(action => !['click', 'wait'].includes(action.type))) {failure = 'mode-action-not-allowed';break;}
                if (performance.now() - started > 7000) {failure = 'model-latency-exceeded-challenge-budget';break;}
                await applyActions(page, output.actions);
                await wait(100);
                const result = await page.evaluate(() => window.__kechapResult);
                if (result) {failure = result.ok ? null : 'server-rejected-interaction';break;}
              }
              const result = await page.evaluate(() => window.__kechapResult);
              trial = {accepted: result?.ok === true, elapsedMs: performance.now() - started, modelCalls: calls, failure, timing: 'Real screenshot and model latency; stale actions are not submitted after challenge budget', observation: 'Screenshot-only; no world JSON or DOM text passed to model'};
            }
          } catch {trial = {accepted: false, elapsedMs: null, modelCalls: [], failure: 'browser-trial-failed'};}
          finally {await page.close();}
        }
        report.trials.push({mode, surface, seed, sample, ...trial});
        console.log(`${mode} / ${surface} / ${sample}: ${trial.accepted ? 'accepted' : trial.failure}`);
      }
    }
    report.groups = [...new Set(report.trials.map(trial => `${trial.mode}/${trial.surface}`))].map(key => {
      const trials = report.trials.filter(trial => `${trial.mode}/${trial.surface}` === key);
      const n = trials.length, successes = trials.filter(trial => trial.accepted).length, rate = successes / n, z = 1.96, divisor = 1 + z * z / n;
      const center = (rate + z * z / (2 * n)) / divisor, margin = z * Math.sqrt(rate * (1 - rate) / n + z * z / (4 * n * n)) / divisor;
      return {group: key, samples: n, successes, successRate: rate, wilson95: {low: Math.max(0, center - margin), high: Math.min(1, center + margin)}, interpretation: 'Small deterministic owned-world sample; not a population guarantee or production security claim'};
    });
    report.totalRecordedInputTokens = report.trials.flatMap(t => t.modelCalls).reduce((sum, call) => sum + (call.usage?.input_tokens ?? 0), 0);
    report.totalRecordedOutputTokens = report.trials.flatMap(t => t.modelCalls).reduce((sum, call) => sum + (call.usage?.output_tokens ?? 0), 0);
    report.securityClaim = 'None. Scripts reading public rules can produce valid interaction; no humans or external CAPTCHA providers evaluated.';
    report.sourceSha256 = {};
    for (const [name, path] of [['renderer', '../src/replay-browser.js'], ['replay', '../src/replay.js'], ['harness', './replay-browser-smoke.js'], ['benchmark', './agent-benchmark.js']]) report.sourceSha256[name] = createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex');
    await mkdir('.local/agent-benchmark', {recursive: true});
    await writeFile('.local/agent-benchmark/report.json', JSON.stringify(report, null, 2) + '\n');
    return report;
  } finally {await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const samples = Number(process.argv.find(arg => /^--samples=/.test(arg))?.split('=')[1] ?? 1);
  const modelOnly = process.argv.includes('--model-only');
  const report = await runAgentBenchmark({samples, includeModel: process.argv.includes('--with-model'), ...(modelOnly ? {modes: ['screenshot-loop', 'gui-agent']} : {})});
  console.log(JSON.stringify({trials: report.trials.length, groups: report.groups, missingModes: report.missingModes, recordedInputTokens: report.totalRecordedInputTokens, recordedOutputTokens: report.totalRecordedOutputTokens, dollarCost: report.dollarCost}, null, 2));
}
