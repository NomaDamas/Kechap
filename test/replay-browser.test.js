import test from 'node:test';
import assert from 'node:assert/strict';
import {browserEventHash, validateReplayWorld, mountReplayWorld} from '../src/replay-browser.js';
import {createReplayChallenge, eventStreamHash, oracleEvents, REPLAY_SURFACES} from '../src/replay.js';
import {parseModelActions} from '../scripts/agent-benchmark.js';

test('browser and server event hashes agree for every owned surface', async () => {
  for (const surface of REPLAY_SURFACES) {
    const world = createReplayChallenge({surface, seed: 'browser-contract'});
    validateReplayWorld(world);
    const events = oracleEvents(world);
    assert.equal(await browserEventHash(events), eventStreamHash(events));
  }
});
test('model controller accepts only bounded pointer, key and wait actions', () => {
  assert.deepEqual(parseModelActions('{"actions":[{"type":"click","x":5,"y":10}]}'), [{type: 'click', x: 5, y: 10}]);
  for (const actions of [[], [{type: 'navigate', url: 'https://external.invalid'}], [{type: 'click', x: -1, y: 5}], [{type: 'wait', ms: 999999}], [{type: 'key', key: 'Control+L'}], [{type: 'drag', fromX: 1, fromY: 1, toX: 5, toY: 5, durationMs: 1}]]) assert.throws(() => parseModelActions(JSON.stringify({actions})));
  assert.throws(() => parseModelActions(JSON.stringify({actions: Array.from({length: 6}, () => ({type: 'wait', ms: 1}))})));
});
test('browser renderer rejects unbounded or malformed public worlds before mounting', () => {
  const world = createReplayChallenge({surface: 'dynamic-sequence'});
  for (const patch of [{maxEvents: Infinity}, {maxDurationMs: 99999999}, {nonce: 'bad'}, {surface: 'external-site'}, {cues: [{choice: 0, startsAtMs: 0, endsAtMs: 9999999}]}]) assert.throws(() => validateReplayWorld({...world, ...patch}));
  const drag = createReplayChallenge({surface: 'drag-rotate'});
  assert.throws(() => validateReplayWorld({...drag, target: {x: Infinity, y: -1}}));
  assert.throws(() => mountReplayWorld(null, world, {onResponse() {}}), /Container/);
});
