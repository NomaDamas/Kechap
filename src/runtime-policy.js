import {assuranceTypes, selectProvider} from './policy.js';

/** Input is trusted server policy and health telemetry, never browser assertions. */
export function resolvePolicy({policy, action, risk, sessionId, previous, health = {}, requiredAssurance}) {
  if (!policy || typeof policy.version !== 'string' || !policy.version || policy.version.length > 128) throw new Error('Policy version required');
  if (!policy.actions || !Object.hasOwn(policy.actions, action)) throw new Error('Action is not allowed by policy');
  const rule = policy.actions[action];
  if (!rule || !Object.hasOwn(rule, risk)) throw new Error('Risk tier is not configured');
  const tier = rule[risk];
  if (!tier || !assuranceTypes.includes(tier.assurance)) throw new Error('Policy assurance required');
  if (requiredAssurance !== undefined && tier.assurance !== requiredAssurance) throw new Error('Policy would change required assurance');
  if (!Array.isArray(tier.providers) || !tier.providers.length) throw new Error('Policy providers required');
  if (!health || typeof health !== 'object' || Array.isArray(health)) throw new Error('Health must be a server-owned object');
  const ids = new Set();
  const eligible = tier.providers.map(item => {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || !Number.isInteger(item.weight ?? 1) || (item.weight ?? 1) < 1 || (item.weight ?? 1) > 100) throw new Error('Unique provider IDs and integer weights 1..100 required');
    ids.add(item.id);
    if (Object.hasOwn(health, item.id) && typeof health[item.id] !== 'boolean') throw new Error('Health values must be boolean');
    return {id: item.id, weight: item.weight ?? 1};
  }).filter(item => !Object.hasOwn(health, item.id) || health[item.id] === true);
  if (!eligible.length) throw new Error('No healthy allowed provider; retry or use product-owned recovery');
  const mode = tier.mode ?? 'stable';
  let provider;
  if (mode === 'weighted') {
    const slots = eligible.flatMap(item => Array(item.weight).fill(item.id));
    provider = selectProvider({providers: slots, sessionId: `${policy.version}:${action}:${risk}:${sessionId}`});
  } else provider = selectProvider({providers: eligible.map(p => p.id), sessionId, previous, mode});
  return {provider, assurance: tier.assurance, policyVersion: policy.version, risk, configuredProviders: tier.providers.map(p => p.id)};
}
