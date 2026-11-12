export const assuranceTypes = Object.freeze(['automation-cost', 'bot-mitigation', 'interaction', 'liveness', 'identity', 'uniqueness']);
const entries = [
  {id: 'pow', assurance: 'automation-cost', selfHosted: true, biometric: false, status: 'experimental', modalities: ['compute']},
  {id: 'altcha', assurance: 'automation-cost', selfHosted: true, biometric: false, status: 'integration-tested', modalities: ['compute'], stars: 2897, starsCheckedAt: '2026-11-12', evidence: 'live-tested', evidenceScope: 'Pinned official library + owned Chromium form; not an attack-resistance audit'},
  {id: 'cap', assurance: 'automation-cost', selfHosted: true, biometric: false, status: 'integration-tested', modalities: ['compute'], stars: 8352, starsCheckedAt: '2026-11-12', evidence: 'live-tested', evidenceScope: 'Pinned format1 SHA256 library + owned Chromium form; no instrumentation'},
  {id: 'turnstile', assurance: 'bot-mitigation', selfHosted: false, biometric: false, status: 'adapter', modalities: ['browser']},
  {id: 'hcaptcha', assurance: 'bot-mitigation', selfHosted: false, biometric: false, status: 'adapter', modalities: ['visual']},
  {id: 'recaptcha', assurance: 'bot-mitigation', selfHosted: false, biometric: false, status: 'adapter', modalities: ['browser']}
];
for (const entry of entries) { entry.stars ??= null; entry.evidence ??= 'mock-tested'; entry.modalities = Object.freeze(entry.modalities); Object.freeze(entry); }
export const capabilities = Object.freeze(entries);

export const recommendationProperties = {
  selfHosted: {type: 'boolean'}, noThirdParty: {type: 'boolean'},
  assurance: {type: 'string', enum: assuranceTypes}, exclude: {type: 'array', items: {type: 'string'}},
  useCase: {type: 'string', enum: ['contact', 'signup', 'reward', 'account-recovery']},
  minStars: {type: 'integer', minimum: 0}, requireLiveEvidence: {type: 'boolean'},
  allowExperimental: {type: 'boolean'}, requiredModalities: {type: 'array', items: {type: 'string'}}
};

export function recommend(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Requirements must be an object');
  if (Object.keys(input).some(k => !Object.hasOwn(recommendationProperties, k))) throw new Error('Unknown requirement; unsupported constraints must not be silently ignored');
  const {selfHosted = false, noThirdParty = false, useCase, exclude = [], minStars = 0, requireLiveEvidence = false, allowExperimental = false, requiredModalities = []} = input;
  const defaults = {contact: 'bot-mitigation', signup: 'bot-mitigation', reward: 'uniqueness', 'account-recovery': 'identity'};
  if (useCase !== undefined && !Object.hasOwn(defaults, useCase)) throw new Error('Unknown useCase');
  const assurance = input.assurance ?? defaults[useCase] ?? 'bot-mitigation';
  if (!assuranceTypes.includes(assurance)) throw new Error('Unknown assurance');
  if ([selfHosted, noThirdParty, requireLiveEvidence, allowExperimental].some(v => typeof v !== 'boolean')) throw new Error('Expected boolean requirements');
  if (!Number.isInteger(minStars) || minStars < 0) throw new Error('minStars must be a non-negative integer');
  if ([exclude, requiredModalities].some(v => !Array.isArray(v) || v.some(s => typeof s !== 'string'))) throw new Error('Expected arrays of strings');
  const evaluations = capabilities.map(p => {
    const reasons = [];
    if (exclude.includes(p.id)) reasons.push('excluded-by-product');
    if ((selfHosted || noThirdParty) && !p.selfHosted) reasons.push('third-party-service-required');
    if (p.assurance !== assurance) reasons.push(`assurance-is-${p.assurance}`);
    if (!allowExperimental && p.status === 'experimental') reasons.push('experimental-opt-in-required');
    if (minStars > 0 && (p.stars === null || p.stars < minStars)) reasons.push(p.stars === null ? 'star-count-unverified' : 'below-star-threshold');
    if (requireLiveEvidence && p.evidence !== 'live-tested') reasons.push('live-integration-evidence-required');
    if (requiredModalities.some(m => !p.modalities.includes(m))) reasons.push('required-modality-not-supported');
    return {provider: p.id, eligible: reasons.length === 0, reasons};
  });
  const candidates = capabilities.filter(p => evaluations.find(e => e.provider === p.id).eligible);
  return {
    requirements: {selfHosted, noThirdParty, assurance, useCase, minStars, requireLiveEvidence, allowExperimental, requiredModalities}, candidates, evaluations,
    recommendationStatus: candidates.length ? 'integration-review-required' : 'unmet-requirements',
    warnings: [
      'No provider proves a unique or honest human merely by passing a challenge.',
      'Catalog candidates are not automatically enabled runtime adapters.',
      'Passing an assurance category check does not prove equal security or accessibility across providers.',
      'Live evidence for OSS adapters refers to owned local integration, not independent security certification.',
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
