export const assuranceTypes = Object.freeze(['automation-cost', 'bot-mitigation', 'interaction', 'liveness', 'identity', 'uniqueness']);
const entries = [
  {id: 'pow', assurance: 'automation-cost', selfHosted: true, biometric: false, status: 'experimental', modalities: ['compute']},
  {id: 'altcha', assurance: 'automation-cost', selfHosted: true, biometric: false, status: 'integration-tested', modalities: ['compute'], stars: 2897, starsCheckedAt: '2026-11-12', evidence: 'live-tested', evidenceScope: 'Pinned official library + owned Chromium form; not an attack-resistance audit'},
  {id: 'cap', assurance: 'automation-cost', selfHosted: true, biometric: false, status: 'integration-tested', modalities: ['compute'], stars: 8352, starsCheckedAt: '2026-11-12', evidence: 'live-tested', evidenceScope: 'Pinned format1 SHA256 library + owned Chromium form; no instrumentation'},
  {id: 'turnstile', assurance: 'bot-mitigation', selfHosted: false, biometric: false, status: 'adapter', modalities: ['browser']},
  {id: 'hcaptcha', assurance: 'bot-mitigation', selfHosted: false, biometric: false, status: 'adapter', modalities: ['visual']},
  {id: 'recaptcha', assurance: 'bot-mitigation', selfHosted: false, biometric: false, status: 'adapter', modalities: ['browser']}
];
const licenses = {
  pow: {spdx: 'Apache-2.0', status: 'project-license', commercialUse: true},
  altcha: {spdx: 'MIT', status: 'source-inspected', commercialUse: true},
  cap: {spdx: 'Apache-2.0', status: 'source-inspected', commercialUse: true},
  turnstile: {spdx: 'proprietary', status: 'official-api-boundary', commercialUse: null},
  hcaptcha: {spdx: 'proprietary', status: 'official-api-boundary', commercialUse: null},
  recaptcha: {spdx: 'proprietary', status: 'official-api-boundary', commercialUse: null}
};
for (const entry of entries) {
  entry.stars ??= null; entry.evidence ??= 'mock-tested';
  entry.licenseReview = Object.freeze(licenses[entry.id]);
  entry.integration = Object.freeze({frameworks: Object.freeze(['node-http']), runtimes: Object.freeze(['node']), minimumNodeMajor: 20, measuredMonthlyCapacity: null, totalMonthlyCostUsd: null, approvedDataRegions: null});
  entry.accessibilityEvidence = Object.freeze({keyboard: entry.selfHosted ? 'browser-control-tested' : 'unverified', 'screen-reader': 'unverified', 'reduced-motion': 'unverified', 'non-puzzle-fallback': 'unverified'});
  entry.modalities = Object.freeze(entry.modalities); Object.freeze(entry);
}
export const capabilities = Object.freeze(entries);

export const recommendationProperties = {
  selfHosted: {type: 'boolean'}, noThirdParty: {type: 'boolean'},
  assurance: {type: 'string', enum: assuranceTypes}, exclude: {type: 'array', items: {type: 'string'}},
  useCase: {type: 'string', enum: ['contact', 'signup', 'reward', 'account-recovery']},
  minStars: {type: 'integer', minimum: 0}, requireLiveEvidence: {type: 'boolean'},
  allowExperimental: {type: 'boolean'}, requiredModalities: {type: 'array', items: {type: 'string'}},
  framework: {type: 'string', minLength: 1}, runtime: {type: 'string', minLength: 1},
  nodeMajor: {type: 'integer', minimum: 1}, dataRegion: {type: 'string', minLength: 2, maxLength: 32},
  privacy: {type: 'string', enum: ['standard', 'no-third-party', 'no-biometric']},
  monthlyTraffic: {type: 'integer', minimum: 0}, maxMonthlyCostUsd: {type: 'number', minimum: 0},
  commercialUse: {type: 'boolean'}, requiredAccessibility: {type: 'array', items: {type: 'string', enum: ['keyboard', 'screen-reader', 'reduced-motion', 'non-puzzle-fallback']}}
};

export function recommend(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Requirements must be an object');
  if (Object.keys(input).some(k => !Object.hasOwn(recommendationProperties, k))) throw new Error('Unknown requirement; unsupported constraints must not be silently ignored');
  const {selfHosted = false, noThirdParty = false, useCase, exclude = [], minStars = 0, requireLiveEvidence = false, allowExperimental = false, requiredModalities = [], framework, runtime, nodeMajor, dataRegion, privacy = 'standard', monthlyTraffic, maxMonthlyCostUsd, commercialUse = false, requiredAccessibility = []} = input;
  const defaults = {contact: 'bot-mitigation', signup: 'bot-mitigation', reward: 'uniqueness', 'account-recovery': 'identity'};
  if (useCase !== undefined && !Object.hasOwn(defaults, useCase)) throw new Error('Unknown useCase');
  const assurance = input.assurance ?? defaults[useCase] ?? 'bot-mitigation';
  if (!assuranceTypes.includes(assurance)) throw new Error('Unknown assurance');
  if ([selfHosted, noThirdParty, requireLiveEvidence, allowExperimental, commercialUse].some(v => typeof v !== 'boolean')) throw new Error('Expected boolean requirements');
  if (!Number.isInteger(minStars) || minStars < 0) throw new Error('minStars must be a non-negative integer');
  if ([exclude, requiredModalities, requiredAccessibility].some(v => !Array.isArray(v) || v.some(s => typeof s !== 'string'))) throw new Error('Expected arrays of strings');
  for (const [key, value] of Object.entries({framework, runtime, dataRegion})) if (value !== undefined && (typeof value !== 'string' || !value.trim() || value.length > 64)) throw new Error(`${key} must be a non-empty string`);
  if (nodeMajor !== undefined && (!Number.isInteger(nodeMajor) || nodeMajor < 1)) throw new Error('nodeMajor must be a positive integer');
  if (!['standard', 'no-third-party', 'no-biometric'].includes(privacy)) throw new Error('Unknown privacy requirement');
  if (monthlyTraffic !== undefined && (!Number.isSafeInteger(monthlyTraffic) || monthlyTraffic < 0)) throw new Error('monthlyTraffic must be a non-negative safe integer');
  if (maxMonthlyCostUsd !== undefined && (!Number.isFinite(maxMonthlyCostUsd) || maxMonthlyCostUsd < 0)) throw new Error('maxMonthlyCostUsd must be finite and non-negative');
  if (requiredAccessibility.some(value => !['keyboard', 'screen-reader', 'reduced-motion', 'non-puzzle-fallback'].includes(value))) throw new Error('Unknown accessibility requirement');
  const evaluations = capabilities.map(p => {
    const reasons = [];
    if (exclude.includes(p.id)) reasons.push('excluded-by-product');
    if ((selfHosted || noThirdParty || privacy === 'no-third-party') && !p.selfHosted) reasons.push('third-party-service-required');
    if (p.assurance !== assurance) reasons.push(`assurance-is-${p.assurance}`);
    if (!allowExperimental && p.status === 'experimental') reasons.push('experimental-opt-in-required');
    if (minStars > 0 && (p.stars === null || p.stars < minStars)) reasons.push(p.stars === null ? 'star-count-unverified' : 'below-star-threshold');
    if (requireLiveEvidence && p.evidence !== 'live-tested') reasons.push('live-integration-evidence-required');
    if (requiredModalities.some(m => !p.modalities.includes(m))) reasons.push('required-modality-not-supported');
    if (!p.licenseReview || ['unknown', 'not-found', 'candidate-not-audited'].includes(p.licenseReview.status)) reasons.push('license-not-reviewed');
    if (commercialUse && p.licenseReview?.commercialUse !== true) reasons.push('commercial-use-terms-not-approved');
    if (framework !== undefined && !p.integration.frameworks.includes(framework)) reasons.push('framework-integration-not-supported');
    if (runtime !== undefined && !p.integration.runtimes.includes(runtime)) reasons.push('runtime-integration-not-supported');
    if (nodeMajor !== undefined && nodeMajor < p.integration.minimumNodeMajor) reasons.push('runtime-version-too-old');
    if (privacy === 'no-biometric' && p.biometric !== false) reasons.push('biometric-privacy-not-met');
    if (dataRegion !== undefined && !p.integration.approvedDataRegions?.includes(dataRegion)) reasons.push('data-region-not-verified');
    if (monthlyTraffic !== undefined && monthlyTraffic > 0 && (p.integration.measuredMonthlyCapacity === null || p.integration.measuredMonthlyCapacity < monthlyTraffic)) reasons.push('traffic-capacity-not-measured');
    if (maxMonthlyCostUsd !== undefined && (p.integration.totalMonthlyCostUsd === null || p.integration.totalMonthlyCostUsd > maxMonthlyCostUsd)) reasons.push('total-cost-not-verified');
    for (const criterion of requiredAccessibility) if (p.accessibilityEvidence[criterion] !== 'independently-tested') reasons.push(`accessibility-${criterion}-not-verified`);
    return {provider: p.id, eligible: reasons.length === 0, reasons};
  });
  const candidates = capabilities.filter(p => evaluations.find(e => e.provider === p.id).eligible);
  return {
    requirements: {selfHosted, noThirdParty, assurance, useCase, minStars, requireLiveEvidence, allowExperimental, requiredModalities, framework, runtime, nodeMajor, dataRegion, privacy, monthlyTraffic, maxMonthlyCostUsd, commercialUse, requiredAccessibility}, candidates, evaluations,
    constraintGuidance: candidates.length ? [] : ['No requirement was relaxed. Change only a constraint your product can accept, or add reviewed evidence/adapter support.', ...(minStars > 0 ? ['Star thresholds are a popularity preference; source, license and integration evidence still need review even if the threshold is lowered.'] : [])],
    recommendationStatus: candidates.length ? 'integration-review-required' : 'unmet-requirements',
    warnings: [
      'No provider proves a unique or honest human merely by passing a challenge.',
      'Catalog candidates are not automatically enabled runtime adapters.',
      'Passing an assurance category check does not prove equal security or accessibility across providers.',
      'Live evidence for OSS adapters refers to owned local integration, not independent security certification.',
      'Self-hosting has infrastructure costs and does not establish measured capacity, data residency, or assistive-technology compliance.',
      'Commercial API terms are product-account-specific; an official endpoint adapter does not approve those terms.',
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
