// Browser protocol implementation for Kechap's explicitly selected OSS baselines.
// Cap derivation mirrors capjs-core 0.1.15 src/prng.js (Apache-2.0, Tiago).
// See THIRD_PARTY_NOTICES.md and pinned upstream evidence in docs/oss-integrations.md.
const hex = bytes => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
const decode = value => {
  if (typeof value !== 'string' || !/^[a-f0-9]{32}$/.test(value)) throw new Error('Expected 16-byte hex nonce');
  return Uint8Array.from(value.match(/../g), n => parseInt(n, 16));
};
export function capDerive(seed, length) {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619) >>> 0;
  let output = '';
  while (output.length < length) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5; state >>>= 0;
    output += state.toString(16).padStart(8, '0');
  }
  return output.slice(0, length);
}

/** Bounded computation, abortable on provider rotation. Not a humanity test. */
export async function solveBrowserWork(publicChallenge, {signal, expiresAt = Date.now() + 120000, maxAttempts = 1000000, digest = bytes => crypto.subtle.digest('SHA-256', bytes)} = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 2000000) throw new Error('Invalid work limit');
  let attempts = 0;
  const startedAt = Date.now();
  const encoder = new TextEncoder();
  const check = async () => {
    if (signal?.aborted) throw new Error('Work cancelled');
    if (Date.now() >= expiresAt) throw new Error('Challenge expired');
    if (++attempts > maxAttempts) throw new Error('Work budget exceeded; request an alternative');
    if (attempts % 128 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  };
  if (publicChallenge.type === 'altcha') {
    const challenge = publicChallenge.challenge;
    const p = challenge?.parameters;
    if (publicChallenge.protocol !== 'v2-sha256' || p?.algorithm !== 'SHA-256' || p.cost !== 1 || p.keyLength !== 32 || !/^[a-f0-9]{1,4}$/.test(p.keyPrefix)) throw new Error('Unsupported ALTCHA work configuration');
    const bytes = new Uint8Array(36); bytes.set(decode(p.salt), 0); bytes.set(decode(p.nonce), 16);
    const view = new DataView(bytes.buffer);
    for (let counter = 0; counter < 0xffffffff; counter++) {
      await check(); view.setUint32(32, counter, false);
      const derivedKey = hex(new Uint8Array(await digest(bytes)));
      if (derivedKey.startsWith(p.keyPrefix)) return btoa(JSON.stringify({challenge, solution: {counter, derivedKey, time: Date.now() - startedAt}}));
    }
  } else if (publicChallenge.type === 'cap') {
    const {token, challenge: p} = publicChallenge.challenge ?? {};
    if (publicChallenge.protocol !== 'sha256-v1' || typeof token !== 'string' || token.length > 8192 || !Number.isInteger(p?.c) || p.c < 1 || p.c > 64 || !Number.isInteger(p.s) || p.s < 1 || p.s > 64 || !Number.isInteger(p.d) || p.d < 1 || p.d > 4) throw new Error('Unsupported Cap work configuration');
    const solutions = [];
    for (let i = 1; i <= p.c; i++) {
      const salt = capDerive(`${token}${i}`, p.s), target = capDerive(`${token}${i}d`, p.d);
      for (let answer = 0; answer < 0xffffffff; answer++) {
        await check();
        const hash = hex(new Uint8Array(await digest(encoder.encode(salt + answer))));
        if (hash.startsWith(target)) { solutions.push(answer); break; }
      }
    }
    return JSON.stringify({token, solutions});
  }
  throw new Error('Unsupported work challenge');
}
