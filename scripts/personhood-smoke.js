// Explicitly invoked, owned NON-PRODUCTION World ID integration test only.
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {worldIdAdapter} from '../src/personhood.js';

const env = process.env;
const required = ['WORLD_ID_APP_ID', 'WORLD_ID_RP_ID', 'WORLD_ID_ACTION', 'WORLD_ID_SIGNING_KEY', 'WORLD_ID_TEST_REGION', 'WORLD_ID_PRIVACY_NOTICE_URL'];
const missing = required.filter(key => !env[key]);
if (env.WORLD_ID_SMOKE_ENABLED !== 'true' || env.WORLD_ID_TEST_CONSENT !== 'I_CONSENT_TO_OWNED_NONPRODUCTION_TEST' || missing.length) {
  console.error('NOT RUN: World ID sandbox/staging success requires a registered app/RP/signing key and an actual proof from IDKit.');
  console.error('Set WORLD_ID_SMOKE_ENABLED=true and WORLD_ID_TEST_CONSENT=I_CONSENT_TO_OWNED_NONPRODUCTION_TEST.');
  console.error('Required configuration names:', required.join(', '));
  if (missing.length) console.error('Missing configuration names:', missing.join(', '));
  process.exitCode = 2;
} else {
  try {
    const environment = env.WORLD_ID_ENVIRONMENT ?? 'sandbox';
    if (!['sandbox', 'staging'].includes(environment)) throw new Error('This smoke script refuses production');
    const mode = process.argv[2] ?? 'issue';
    if (!['issue', 'verify'].includes(mode)) throw new Error('Usage: node scripts/personhood-smoke.js issue|verify');
    const folder = resolve('.local/personhood');
    const context = {tenant: 'owned-world-id-test', action: 'sandbox-validation', subject: 'local-operator-session'};
    // Single-run test fixture only; production must use an atomic durable claim.
    const nullifiers = new Set();
    const adapter = worldIdAdapter({
      enabled: true, appId: env.WORLD_ID_APP_ID, rpId: env.WORLD_ID_RP_ID, action: env.WORLD_ID_ACTION,
      signingKey: env.WORLD_ID_SIGNING_KEY, environment, ttlSeconds: 300,
      privacyPolicy: {consentVersion: 'owned-sandbox-test-v1', noticeUrl: env.WORLD_ID_PRIVACY_NOTICE_URL, permittedRegions: [env.WORLD_ID_TEST_REGION], nullifierRetentionDays: 1, fallback: 'Cancel this test; no production account, access or reward is granted'},
      checkConsent: async () => ({granted: env.WORLD_ID_TEST_CONSENT === 'I_CONSENT_TO_OWNED_NONPRODUCTION_TEST', version: 'owned-sandbox-test-v1', region: env.WORLD_ID_TEST_REGION}),
      claimNullifier: async ({namespace, nullifier}) => {const key = `${namespace}:${nullifier}`; if (nullifiers.has(key)) return false; nullifiers.add(key); return true;},
    });
    await mkdir(folder, {recursive: true});
    if (mode === 'issue') {
      const issued = await adapter.issue({context});
      await writeFile(resolve(folder, 'request.json'), JSON.stringify(issued.public, null, 2) + '\n', {mode: 0o600});
      await writeFile(resolve(folder, 'state.json'), JSON.stringify({state: issued.private, environment, retired: false}) + '\n', {mode: 0o600});
      console.log('Signed nonproduction request saved to .local/personhood/request.json. Use its rp_context with official IDKit proofOfHuman; forward the complete result into WORLD_ID_PROOF_FILE, then invoke verify before expiry. No proof has been verified yet.');
    } else {
      if (!env.WORLD_ID_PROOF_FILE) throw new Error('WORLD_ID_PROOF_FILE must point to the complete actual IDKit result');
      const saved = JSON.parse(await readFile(resolve(folder, 'state.json'), 'utf8'));
      if (saved.retired || saved.environment !== environment) throw new Error('No current matching nonproduction request; issue a new one');
      const response = await readFile(resolve(env.WORLD_ID_PROOF_FILE), 'utf8');
      // Burn the local test request before network calls; uncertain failures are not retried as successes.
      await writeFile(resolve(folder, 'state.json'), JSON.stringify({retired: true}) + '\n', {mode: 0o600});
      const ok = await adapter.verify({response, state: saved.state, context});
      await writeFile(resolve(folder, 'report.json'), JSON.stringify({testedAt: new Date().toISOString(), environment, ok, scope: 'Owned World ID 4.0 issuer1 proof roundtrip only; nonproduction. No real-world uniqueness or security certification claimed.', rawProofRetainedByKechap: false, productionDurableStoreTested: false}, null, 2) + '\n', {mode: 0o600});
      if (!ok) throw new Error('Official verification or local scope/nullifier check failed; success not claimed');
      console.log('Actual official nonproduction proof verified. Sanitized report saved; no production claim is made.');
    }
  } catch {
    console.error('World ID smoke incomplete: check registered scope, configuration, actual proof, consent, environment and request expiry. No credential or raw proof is logged.');
    process.exitCode = 1;
  }
}
