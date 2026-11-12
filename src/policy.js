export const capabilities = Object.freeze([
  {id: 'pow', assurance: 'automation-cost', selfHosted: true, biometric: false, status: 'experimental', modalities: ['compute']},
  {id: 'turnstile', assurance: 'bot-mitigation', selfHosted: false, biometric: false, status: 'adapter', modalities: ['browser']},
  {id: 'hcaptcha', assurance: 'bot-mitigation', selfHosted: false, biometric: false, status: 'adapter', modalities: ['visual']},
  {id: 'recaptcha', assurance: 'bot-mitigation', selfHosted: false, biometric: false, status: 'adapter', modalities: ['browser']}
]);

export function recommend(input = {}) {
  const {selfHosted = false, noThirdParty = false, assurance = 'bot-mitigation', exclude = []} = input;
  if (!['bot-mitigation', 'automation-cost', 'liveness', 'identity', 'uniqueness'].includes(assurance)) throw new Error('Unknown assurance');
  if (!Array.isArray(exclude)) throw new Error('exclude must be an array');
  const candidates = capabilities.filter(p => !exclude.includes(p.id) && (!(selfHosted || noThirdParty) || p.selfHosted) && p.assurance === assurance);
  return {
    requirements: {selfHosted, noThirdParty, assurance}, candidates,
    warnings: [
      'No provider proves a unique or honest human merely by passing a challenge.',
      'Catalog candidates are not automatically enabled runtime adapters.',
      ...(candidates.length ? [] : ['No implemented adapter meets these requirements; do not silently lower assurance.']),
      ...(candidates.some(p => p.id === 'pow') ? ['Experimental PoW measures computational work, not human presence.'] : [])
    ],
    integration: {serverRequired: true, bindTo: ['tenant', 'action', 'subject'], fallback: 'Product-owned assisted recovery; never automatic acceptance'}
  };
}

export function selectProvider({providers, sessionId, previous, mode = 'stable'}) {
  if (!Array.isArray(providers) || !providers.length || providers.some(p => typeof p !== 'string')) throw new Error('providers required');
  if (!['stable', 'rotate'].includes(mode)) throw new Error('Unknown rotation mode');
  if (mode === 'rotate' && previous && providers.length > 1) return providers[(providers.indexOf(previous) + 1) % providers.length];
  // Selection is a policy convenience, never a source of challenge entropy.
  let hash = 2166136261;
  for (const ch of String(sessionId)) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  return providers[hash % providers.length];
}
