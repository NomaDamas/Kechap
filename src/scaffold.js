import {readFile, mkdir, writeFile, lstat, realpath} from 'node:fs/promises';
import {resolve, dirname, join, relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {recommend} from './policy.js';

const supported = new Set(['pow', 'altcha', 'cap', 'turnstile', 'hcaptcha', 'recaptcha']);

/** Produce a reviewable Node HTTP integration without generating credentials. */
export async function scaffoldPlan(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => !['provider', 'recaptchaMode', 'hostname'].includes(k))) throw new Error('Unknown or invalid scaffold option');
  const {provider = 'turnstile', recaptchaMode, hostname = 'localhost'} = options;
  if (!supported.has(provider)) throw new Error('Unsupported provider');
  if (typeof hostname !== 'string' || hostname.length > 253 || !hostname.split('.').every(label => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label))) throw new Error('Expected hostname without protocol, port or path');
  if (provider === 'recaptcha' && !['v2', 'v3'].includes(recaptchaMode)) throw new Error('Choose recaptchaMode v2 or v3');
  if (provider !== 'recaptcha' && recaptchaMode !== undefined) throw new Error('recaptchaMode only applies to recaptcha');
  const files = {};
  const computeOnly = ['pow', 'altcha', 'cap'].includes(provider);
  for (const source of ['src/index.js', 'src/oss.js', 'src/policy.js', 'src/runtime-policy.js', 'src/browser.js', 'src/browser-work.js', 'examples/web/server.js', 'examples/web/app.js', 'examples/web/index.html', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    files[source] = await readFile(new URL('../' + source, import.meta.url), 'utf8');
  }
  files['package.json'] = JSON.stringify({name: 'kechap-integration', version: '0.1.0', private: true, type: 'module', engines: {node: '>=20'}, dependencies: {'altcha-lib': '2.8.0', 'capjs-core': '0.1.15'}, scripts: {start: 'node --env-file=.env examples/web/server.js'}}, null, 2) + '\n';
  const prefix = provider.toUpperCase();
  files['.env.example'] = `PORT=3000\nKECHAP_PROVIDERS=${provider}\nKECHAP_HOSTNAME=${hostname}\n` + (provider === 'pow' ? '' : ['altcha', 'cap'].includes(provider) ? `${prefix}_SECRET=\n` : `${prefix}_SITE_KEY=\n${prefix}_SECRET=\n`) + (provider === 'recaptcha' ? `RECAPTCHA_MODE=${recaptchaMode}\n` + (recaptchaMode === 'v3' ? 'RECAPTCHA_MIN_SCORE=0.7\n' : '') : '');
  files['.gitignore'] = '.env\nnode_modules/\n';
  files['README.md'] = `# Kechap Node HTTP integration\n\nProvider: ${provider}. Assurance: ${provider === 'pow' ? 'automation-cost (experimental; not human proof)' : 'bot-mitigation (live vendor validation still required)'}.\n\nCopy .env.example to .env, enter your own provider keys if needed, run npm install, then npm start and open http://localhost:3000. Dependencies are pinned ALTCHA and Cap libraries; install them before using those providers. Never put secret keys in the browser or Git.\n\nThis is a working integration starting point, not a production identity service. /api/signup demonstrates a protected action without creating an account. Replace that action with your product operation and add its transaction/idempotency rules. Server-derived context, CSRF, request limits and one-use verification are included. Memory sessions/store are development only: replace with shared atomic TTL storage, production session authentication, HTTPS and rate limits.\n\nThe default page permits cancel/retry; it does not implement an accessible alternate authentication channel. Configure a real product-owned equivalent recovery path before launch and test with assistive technology. PoW is computational work, not proof of a human. Commercial provider scripts require network access, vendor registration and privacy review. hCaptcha/classic reCAPTCHA tokens are bearer proofs, not original-browser-session attestations.\n\nKechap source is Apache-2.0; see LICENSE. This scaffold copies the local Kechap prototype; it does not copy commercial engines.\n`;
  files['README.md'] = files['README.md'].replace('Assurance: bot-mitigation (live vendor validation still required)', computeOnly ? 'Assurance: automation-cost (computational work, not human proof)' : 'Assurance: bot-mitigation (live vendor validation still required)');
  return {framework: 'node-http', provider, status: 'review-required', files, warnings: ['No vendor credentials are generated.', 'This creates a new standalone integration; it does not patch existing product routes.', 'Production storage, real accessible recovery and live provider validation remain required.']};
}

/** Recommendation constraints stay authoritative through generated output. */
export async function integrationPlan(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => !['requirements', 'provider', 'recaptchaMode', 'hostname'].includes(k))) throw new Error('Unknown or invalid integration option');
  if (!options.requirements) throw new Error('Product requirements are required');
  const recommendation = recommend(options.requirements);
  if (!recommendation.candidates.length) return {status: 'unmet-requirements', recommendation, files: {}, warnings: ['No installation files generated: no implemented provider meets the declared requirements.']};
  const selected = options.provider ?? recommendation.candidates[0].id;
  if (!recommendation.candidates.some(candidate => candidate.id === selected)) throw new Error('Selected provider does not satisfy product requirements');
  const plan = await scaffoldPlan({provider: selected, ...(options.hostname !== undefined ? {hostname: options.hostname} : {}), ...(options.recaptchaMode !== undefined ? {recaptchaMode: options.recaptchaMode} : {})});
  return {...plan, recommendation, selectionReason: options.provider ? 'Explicit choice among eligible adapters' : 'First eligible adapter in declared implementation order; not a security ranking'};
}

export async function writeScaffold(destination, options) {
  const plan = options && Object.hasOwn(options, 'requirements') ? await integrationPlan(options) : await scaffoldPlan(options);
  if (plan.status === 'unmet-requirements') throw new Error('No eligible adapter; refusing to create an integration with weaker requirements');
  const target = resolve(destination);
  const parent = await realpath(dirname(target));
  if (join(parent, target.split('/').at(-1)) !== target) throw new Error('Destination parent must be a real directory, not a symlink');
  try { await lstat(target); throw new Error('Destination already exists; refusing to overwrite'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Atomic reservation of a fresh directory also rejects racing writers/symlinks.
  await mkdir(target);
  for (const [name, content] of Object.entries(plan.files)) {
    const path = join(target, name);
    if (relative(target, path).startsWith('..')) throw new Error('Path escaped destination');
    await mkdir(dirname(path), {recursive: true});
    await writeFile(path, content, {flag: 'wx'});
  }
  return {...plan, files: Object.keys(plan.files), destination: target};
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const [destination, json] = process.argv.slice(2);
    if (!destination) throw new Error('Usage: node src/scaffold.js <new-directory|--preview> [options JSON]');
    const options = JSON.parse(json ?? '{}');
    const result = destination === '--preview' ? (Object.hasOwn(options, 'requirements') ? await integrationPlan(options) : await scaffoldPlan(options)) : await writeScaffold(destination, options);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
