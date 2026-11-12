import {createHash} from 'node:crypto';
import {Kechap, powAdapter} from '../src/index.js';

// Controlled local demonstration. A script can solve PoW: it is NOT human proof.
const kechap = new Kechap({adapters: {pow: powAdapter({difficulty: 2})}});
const context = {tenant: 'demo', action: 'submit-form', subject: 'opaque-session-id'};
const challenge = await kechap.issue({context, providers: ['pow'], assurance: 'automation-cost', sessionId: 'server-session'});
let answer = 0;
while (!createHash('sha256').update(`${challenge.challenge.salt}:${answer}`).digest('hex').startsWith('0'.repeat(challenge.challenge.difficulty))) answer++;
const result = await kechap.verify({id: challenge.id, context, response: String(answer)});
console.log({challenge, verification: {...result, token: '[redacted]'}});
console.log('First consume:', await kechap.consume({token: result.token, context}));
console.log('Replay:', await kechap.consume({token: result.token, context}));
