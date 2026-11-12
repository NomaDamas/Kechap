import {randomBytes} from 'node:crypto';

const MAX_RESPONSE_BYTES = 32768;
function secretRequired(secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw new Error('A server-only secret of at least 32 bytes is required');
}
function validTtl(ttlMs) {
  if (!Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > 300000) throw new Error('OSS challenge TTL must be 1000..300000 ms');
}
function parseResponse(response, base64 = false) {
  if (typeof response !== 'string' || !response || Buffer.byteLength(response) > MAX_RESPONSE_BYTES) return null;
  if (base64 && !/^[A-Za-z0-9+/]+={0,2}$/.test(response)) return null;
  try {
    const decoded = base64 ? Buffer.from(response, 'base64').toString('utf8') : response;
    const value = JSON.parse(decoded);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}

/** ALTCHA v2 core PoW; signed by official altcha-lib, not a liveness claim. */
export function altchaAdapter({secret, keyPrefix = '000', ttlMs = 120000} = {}) {
  secretRequired(secret); validTtl(ttlMs);
  if (typeof keyPrefix !== 'string' || !/^[a-f0-9]{1,4}$/.test(keyPrefix)) throw new Error('ALTCHA keyPrefix must be 1..4 lowercase hex characters');
  return {
    assurance: 'automation-cost',
    async issue() {
      const {createChallenge} = await import('altcha-lib');
      const {deriveKey} = await import('altcha-lib/algorithms/sha');
      const challenge = await createChallenge({algorithm: 'SHA-256', cost: 1, keyPrefix, deriveKey, hmacSignatureSecret: secret, expiresAt: new Date(Date.now() + ttlMs)});
      // Public and private objects must not alias in an in-process integration.
      return {public: {type: 'altcha', protocol: 'v2-sha256', challenge: structuredClone(challenge)}, private: {challenge}};
    },
    async verify({response, state}) {
      const payload = parseResponse(response, true);
      if (!payload?.solution || !state?.challenge || canonical(payload.challenge) !== canonical(state.challenge)) return false;
      try {
        const {verifySolution} = await import('altcha-lib');
        const {deriveKey} = await import('altcha-lib/algorithms/sha');
        const result = await verifySolution({challenge: state.challenge, solution: payload.solution, deriveKey, hmacSignatureSecret: secret});
        return result.verified === true;
      } catch { return false; }
    }
  };
}

/** Cap's official current core, explicitly using its supported SHA-256 baseline. */
export function capAdapter({secret, challengeCount = 4, challengeDifficulty = 3, ttlMs = 120000} = {}) {
  secretRequired(secret); validTtl(ttlMs);
  if (!Number.isInteger(challengeCount) || challengeCount < 1 || challengeCount > 64) throw new Error('Cap challengeCount must be 1..64');
  if (!Number.isInteger(challengeDifficulty) || challengeDifficulty < 1 || challengeDifficulty > 4) throw new Error('Cap challengeDifficulty must be 1..4');
  return {
    assurance: 'automation-cost',
    async issue() {
      const {generateChallenge} = await import('capjs-core');
      const scope = randomBytes(24).toString('hex');
      const challenge = await generateChallenge(secret, {format: 1, challengeCount, challengeSize: 32, challengeDifficulty, expiresMs: ttlMs, scope});
      return {public: {type: 'cap', protocol: 'sha256-v1', challenge: structuredClone(challenge)}, private: {token: challenge.token, scope, count: challengeCount}};
    },
    async verify({response, state}) {
      const body = parseResponse(response);
      if (!body || !state || body.token !== state.token || !Array.isArray(body.solutions) || body.solutions.length !== state.count || body.solutions.some(n => !Number.isSafeInteger(n) || n < 0 || n > 0xffffffff)) return false;
      try {
        const {validateChallenge} = await import('capjs-core');
        // Kechap atomically takes this specific challenge before calling us.
        // Its attestation replaces the upstream redemption token; don't expose it.
        const result = await validateChallenge(secret, {token: state.token, solutions: body.solutions}, {scope: state.scope});
        return result.success === true;
      } catch { return false; }
    }
  };
}
