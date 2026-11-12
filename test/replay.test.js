import test from 'node:test';
import assert from 'node:assert/strict';
import {Kechap} from '../src/index.js';
import {createReplayChallenge, REPLAY_SURFACES, eventStreamHash, replayEvents, oracleEvents, replayAdapter} from '../src/replay.js';

const spec = surface => createReplayChallenge({surface, seed: 'regression-seed', nonce: 'test_nonce_1234567890'});
const response = (challenge, events = oracleEvents(challenge)) => ({nonce: challenge.nonce, events, eventStreamHash: eventStreamHash(events)});
const replay = (challenge, body) => replayEvents(challenge, body, {observedElapsedMs: 7000});

test('all three seeded toy worlds replay rule-aware script inputs without claiming humanity', () => {
  for (const surface of REPLAY_SURFACES) {
    const challenge = spec(surface);
    assert.deepEqual(spec(surface), challenge);
    const result = replay(challenge, response(challenge));
    assert.equal(result.ok, true, surface);
    assert.equal(result.assurance, 'interaction');
    assert.equal(Object.hasOwn(result, 'humanVerified'), false);
  }
});
test('nonce, hash and event mutations are rejected', () => {
  const challenge = spec('static-choice');
  const body = response(challenge);
  assert.equal(replay(challenge, {...body, nonce: 'another_nonce_1234567890'}).ok, false);
  assert.equal(replay(challenge, {...body, eventStreamHash: '0'.repeat(64)}).ok, false);
  body.events[0].choice = (body.events[0].choice + 1) % 4;
  assert.equal(replay(challenge, body).ok, false);
  body.eventStreamHash = eventStreamHash(body.events);
  assert.equal(replay(challenge, body).ok, false);
});
test('server elapsed time, expiry and event ordering constrain replay', () => {
  const challenge = spec('dynamic-sequence'); const body = response(challenge);
  assert.equal(replayEvents(challenge, body, {observedElapsedMs: 100}).reason, 'future-event');
  assert.equal(replayEvents(challenge, body, {observedElapsedMs: 15001}).ok, false);
  assert.equal(replayEvents(challenge, body).ok, false);
  const events = oracleEvents(challenge); events[1].t = events[0].t;
  assert.equal(replay(challenge, response(challenge, events)).reason, 'event-order-or-time');
  const outside = oracleEvents(challenge); outside[0].t = challenge.cues[0].endsAtMs;
  assert.equal(replay(challenge, response(challenge, outside)).reason, 'sequence-rule-or-window');
});
test('oversized, unknown, non-finite and malformed event streams fail closed', () => {
  const challenge = spec('drag-rotate');
  assert.equal(replay(challenge, response(challenge, Array.from({length: 65}, () => ({type: 'choose', t: 100, choice: 0})))).reason, 'event-limit');
  for (const patch of [{t: NaN}, {t: -1}, {x: 1001}, {type: 'success'}, {success: true}]) {
    const events = oracleEvents(challenge); events[0] = {...events[0], ...patch};
    assert.equal(replay(challenge, response(challenge, events)).ok, false);
  }
});
test('drag replay checks full state transitions and final angle instead of client success claims', () => {
  const challenge = spec('drag-rotate');
  const wrongAngle = oracleEvents(challenge); wrongAngle.at(-2).angle = 0;
  assert.equal(replay(challenge, response(challenge, wrongAngle)).ok, false);
  const teleport = oracleEvents(challenge); teleport[1].t = 101; teleport[1].x = challenge.target.x; teleport[1].y = challenge.target.y;
  assert.equal(replay(challenge, response(challenge, teleport)).reason, 'drag-speed');
  const upEarly = oracleEvents(challenge); upEarly[2].type = 'up';
  assert.equal(replay(challenge, response(challenge, upEarly)).reason, 'drag-order');
});
test('adapter protects private state from public mutation and Kechap consumes proof once', async () => {
  let time = 1000;
  const adapter = replayAdapter({surface: 'dynamic-sequence', now: () => time});
  const issued = await adapter.issue(); issued.public.cues[0].choice = 99;
  assert.notEqual(issued.private.challenge.cues[0].choice, 99);
  const k = new Kechap({now: () => time, adapters: {replay: adapter}});
  const context = {tenant: 'toy', action: 'benchmark', subject: 'owned-session'};
  const challenge = await k.issue({context, providers: ['replay'], assurance: 'interaction', sessionId: 'owned'});
  const body = response(challenge.challenge); time += 4000;
  const verified = await k.verify({id: challenge.id, context, response: JSON.stringify(body)});
  assert.equal(verified.ok, true);
  assert.equal((await k.verify({id: challenge.id, context, response: JSON.stringify(body)})).ok, false);
  assert.equal((await k.consume({token: verified.token, context})).ok, true);
  assert.equal((await k.consume({token: verified.token, context})).ok, false);
});
