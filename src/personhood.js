import {createHash} from 'node:crypto';
import {signRequest, Nullifier} from '@worldcoin/idkit-server';

const VERIFY_ORIGIN = 'https://developer.world.org';
const HEX256 = /^0x[0-9a-fA-F]{1,64}$/;
const hash = value => createHash('sha256').update(value).digest('hex');
const canonicalNullifier = value => typeof value === 'string' && HEX256.test(value) ? Nullifier.fromHex(value).toBigInt().toString(10) : null;
const boundedString = value => typeof value === 'string' && value.length > 0 && value.length <= 512;

/**
 * Optional issuer-1 World ID 4.0 uniqueness verifier, disabled by default.
 * It never captures camera, voice, images or biometric templates.
 * Official success is not sufficient: product-owned atomic nullifier claim is required.
 */
export function worldIdAdapter({
  enabled = false, appId, rpId, action, signingKey, environment = 'sandbox',
  allowProduction = false, ttlSeconds = 120, privacyPolicy, checkConsent, claimNullifier,
  fetchImpl = globalThis.fetch, now = Date.now,
} = {}) {
  if (typeof enabled !== 'boolean') throw new Error('enabled must be boolean');
  if (!enabled) return {
    assurance: 'uniqueness', enabled: false,
    async issue() { throw new Error('World ID is disabled; explicit enrollment, policy and consent are required'); },
    async verify() { return false; },
  };
  if (!/^app_[A-Za-z0-9_]+$/.test(appId ?? '') || !/^rp_[A-Za-z0-9_]+$/.test(rpId ?? '') || !boundedString(action)) throw new Error('Registered World ID appId, rpId and action are required');
  if (typeof signingKey !== 'string' || !/^(?:0x)?[a-fA-F0-9]{64}$/.test(signingKey) || /^0x?0+$/.test(signingKey)) throw new Error('Server-only RP signing key is required');
  if (!['production', 'sandbox', 'staging'].includes(environment) || (environment === 'production' && allowProduction !== true)) throw new Error('Production requires an explicit opt-in; sandbox/staging proofs are never production proofs');
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > 300) throw new Error('ttlSeconds must be 30..300');
  if (!privacyPolicy || !boundedString(privacyPolicy.consentVersion) || typeof privacyPolicy.noticeUrl !== 'string' || !privacyPolicy.noticeUrl.startsWith('https://') || !boundedString(privacyPolicy.fallback) || !Array.isArray(privacyPolicy.permittedRegions) || !privacyPolicy.permittedRegions.length || privacyPolicy.permittedRegions.some(r => !/^[A-Z]{2}$/.test(r)) || !Number.isInteger(privacyPolicy.nullifierRetentionDays) || privacyPolicy.nullifierRetentionDays < 1 || privacyPolicy.nullifierRetentionDays > 365) throw new Error('Explicit consent version, HTTPS notice, regions, retention 1..365 days and product recovery are required');
  if (typeof checkConsent !== 'function' || typeof claimNullifier !== 'function' || typeof fetchImpl !== 'function') throw new Error('Server consent check and durable atomic nullifier claim are required');
  const policy = structuredClone(privacyPolicy);

  return {
    assurance: 'uniqueness', enabled: true,
    async issue({context} = {}) {
      if (!context || !['tenant', 'action', 'subject'].every(key => boundedString(context[key]))) throw new Error('Trusted product context required');
      const consent = await checkConsent({context, policyVersion: policy.consentVersion});
      if (consent?.granted !== true || consent.version !== policy.consentVersion || !policy.permittedRegions.includes(consent.region)) throw new Error('Current explicit consent and an approved region are required');
      const signed = signRequest({signingKeyHex: signingKey, action, ttl: ttlSeconds});
      const rpContext = {rp_id: rpId, nonce: signed.nonce, created_at: signed.createdAt, expires_at: signed.expiresAt, signature: signed.sig};
      const expiresAt = Math.min(now() + ttlSeconds * 1000, signed.expiresAt * 1000);
      return {
        public: {
          type: 'world-id', protocol: '4.0', app_id: appId, action, environment,
          rp_context: rpContext, preset: 'proofOfHuman', issuer_schema_id: 1,
          testOnly: environment !== 'production',
          privacy: {noticeUrl: policy.noticeUrl, consentVersion: policy.consentVersion, rawBiometricsCollected: false, nullifierRetentionDays: policy.nullifierRetentionDays, fallback: policy.fallback},
        },
        private: {nonce: signed.nonce, expiresAt, binding: hash(JSON.stringify([context.tenant, context.action, context.subject])), consentRegion: consent.region},
      };
    },
    async verify({response, state, context} = {}) {
      try {
        if (!state || state.expiresAt <= now() || typeof response !== 'string' || Buffer.byteLength(response) > 16384 || !context || state.binding !== hash(JSON.stringify([context.tenant, context.action, context.subject]))) return false;
        const body = JSON.parse(response);
        // This narrow integration does not enable selfie, document, session or legacy flows.
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['protocol_version', 'nonce', 'action', 'action_description', 'responses', 'environment'].includes(key))) return false;
        if (body.protocol_version !== '4.0' || body.nonce !== state.nonce || body.action !== action || body.environment !== environment || !Array.isArray(body.responses) || body.responses.length !== 1) return false;
        const proof = body.responses[0];
        if (!proof || Object.keys(proof).some(key => !['identifier', 'issuer_schema_id', 'nullifier', 'expires_at_min', 'proof', 'signal_hash'].includes(key)) || proof.identifier !== 'proof_of_human' || proof.issuer_schema_id !== 1 || !Number.isSafeInteger(proof.expires_at_min) || proof.expires_at_min < 0 || !Array.isArray(proof.proof) || proof.proof.length !== 5 || proof.proof.some(element => typeof element !== 'string' || !HEX256.test(element)) || (proof.signal_hash !== undefined && !HEX256.test(proof.signal_hash))) return false;
        const nullifier = canonicalNullifier(proof.nullifier);
        if (nullifier === null) return false;
        const consent = await checkConsent({context, policyVersion: policy.consentVersion});
        if (consent?.granted !== true || consent.version !== policy.consentVersion || consent.region !== state.consentRegion || !policy.permittedRegions.includes(consent.region)) return false;
        const upstream = await fetchImpl(`${VERIFY_ORIGIN}/api/v4/verify/${encodeURIComponent(rpId)}`, {
          method: 'POST', headers: {'Content-Type': 'application/json'}, body: response,
          signal: AbortSignal.timeout(5000), redirect: 'error',
        });
        if (!upstream.ok) return false;
        const result = await upstream.json();
        if (result?.success !== true || result.environment !== environment || result.action !== action || !Array.isArray(result.results) || !result.results.some(item => item?.identifier === 'proof_of_human' && item.success === true && canonicalNullifier(item.nullifier) === nullifier) || state.expiresAt <= now()) return false;
        // The store MUST atomically return true only for the first insert of this key.
        // A network timeout after an insert is conservatively a failed attempt.
        const namespace = hash(JSON.stringify([context.tenant, rpId, environment, action, 1]));
        return await claimNullifier({namespace, nullifier, expiresAt: now() + policy.nullifierRetentionDays * 86400000}) === true;
      } catch { return false; }
    },
  };
}
