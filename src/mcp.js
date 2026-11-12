import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
import {recommend, recommendationProperties} from './policy.js';
import {scaffoldPlan} from './scaffold.js';

const tools = [
  {name: 'kechap_scaffold', description: 'Generate reviewable Node HTTP integration file contents without writing files or credentials.', inputSchema: {type: 'object', properties: {provider: {type: 'string', enum: ['pow', 'altcha', 'cap', 'turnstile', 'hcaptcha', 'recaptcha']}, recaptchaMode: {type: 'string', enum: ['v2', 'v3']}, hostname: {type: 'string'}}, additionalProperties: false}},
  {name: 'kechap_catalog', description: 'List human verification candidates and evidence status; not a security endorsement.', inputSchema: {type: 'object', properties: {}, additionalProperties: false}},
  {name: 'kechap_recommend', description: 'Explain eligibility and unmet requirements for implemented adapters; not a security endorsement.', inputSchema: {type: 'object', properties: recommendationProperties, additionalProperties: false}},
  {name: 'kechap_plan', description: 'Return a reviewable integration plan. Does not edit files or configure vendors.', inputSchema: {type: 'object', properties: recommendationProperties, additionalProperties: false}}
].map(t => ({...t, annotations: {readOnlyHint: true, destructiveHint: false, openWorldHint: false}}));

export async function handle(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return {jsonrpc: '2.0', id: message?.id ?? null, error: {code: -32600, message: 'Invalid Request'}};
  if (!Object.hasOwn(message, 'id')) return null;
  const reply = value => ({jsonrpc: '2.0', id: message.id, result: value});
  if (message.method === 'initialize') {
    const supported = ['2024-11-05', '2025-03-26', '2025-06-18'];
    return reply({protocolVersion: supported.includes(message.params?.protocolVersion) ? message.params.protocolVersion : '2025-06-18', capabilities: {tools: {listChanged: false}}, serverInfo: {name: 'kechap', version: '0.1.0'}});
  }
  if (message.method === 'ping') return reply({});
  if (message.method === 'tools/list') return reply({tools});
  if (message.method !== 'tools/call') return {jsonrpc: '2.0', id: message.id, error: {code: -32601, message: 'Method not found'}};
  const {name, arguments: args = {}} = message.params ?? {};
  try {
    if (!tools.some(t => t.name === name)) throw new Error('Unknown tool');
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Arguments must be an object');
    const allowed = name === 'kechap_catalog' ? [] : name === 'kechap_scaffold' ? ['provider', 'recaptchaMode', 'hostname'] : Object.keys(recommendationProperties);
    if (Object.keys(args).some(k => !allowed.includes(k))) throw new Error('Unknown argument');
    if (['selfHosted', 'noThirdParty'].some(k => args[k] !== undefined && typeof args[k] !== 'boolean')) throw new Error('Expected boolean');
    if (args.exclude !== undefined && (!Array.isArray(args.exclude) || args.exclude.some(v => typeof v !== 'string'))) throw new Error('exclude must contain strings');
    let result;
    if (name === 'kechap_scaffold') result = await scaffoldPlan(args);
    else if (name === 'kechap_catalog') result = JSON.parse(await readFile(new URL('../catalog/providers.json', import.meta.url), 'utf8'));
    else {
      result = recommend(args);
      if (name === 'kechap_plan') result.steps = [
        'Choose a candidate whose assurance meets product requirements; review evidence and license.',
        'Register vendor site keys if needed; keep secret keys only on your server.',
        'Mount provider-owned browser widget; route issue/verify through authenticated server endpoints.',
        'Bind tenant/action/opaque subject from server state; enforce CSRF, rate limits and request size limits.',
        'Use an atomic shared TTL store in production. Consume the attestation before the protected action.',
        'Configure accessible assisted recovery and same-assurance rotation; never fail open on outage.',
        'Run product integration tests and vendor staging verification before deployment.'
      ];
    }
    return reply({content: [{type: 'text', text: JSON.stringify(result, null, 2)}]});
  } catch (error) { return reply({isError: true, content: [{type: 'text', text: error.message}]}); }
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const lines = createInterface({input: process.stdin, crlfDelay: Infinity});
  for await (const line of lines) {
    if (!line.trim()) continue;
    let response;
    try { response = line.length > 1048576 ? {jsonrpc: '2.0', id: null, error: {code: -32600, message: 'Request too large'}} : await handle(JSON.parse(line)); }
    catch { response = {jsonrpc: '2.0', id: null, error: {code: -32700, message: 'Parse error'}}; }
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}
