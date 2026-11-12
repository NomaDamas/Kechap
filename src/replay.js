import {createHash, randomBytes} from 'node:crypto';

export const REPLAY_REVISION = 'kechap-toy-replay-v1';
export const REPLAY_SURFACES = Object.freeze(['static-choice', 'drag-rotate', 'dynamic-sequence']);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const integer = (n, low, high) => Number.isInteger(n) && n >= low && n <= high;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const keysAre = (object, allowed) => object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).length === allowed.length && Object.keys(object).every(key => allowed.includes(key));

/** A content hash for reproducibility; this is NOT a signature or an authenticity check. */
export function eventStreamHash(events) {
  const canonical = events.map(event => Object.fromEntries(Object.keys(event).sort().map(key => [key, event[key]])));
  return sha256(JSON.stringify(canonical));
}

/** Public deterministic toy worlds; their rules are deliberately available to scripts. */
export function createReplayChallenge({surface = 'dynamic-sequence', seed = randomBytes(16).toString('hex'), nonce = randomBytes(24).toString('base64url')} = {}) {
  if (!REPLAY_SURFACES.includes(surface)) throw new Error('Unknown replay surface');
  if (typeof seed !== 'string' || seed.length < 1 || seed.length > 128) throw new Error('seed must be 1..128 characters');
  if (typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) throw new Error('Invalid replay nonce');
  let counter = 0;
  const random = limit => Number.parseInt(sha256(`${REPLAY_REVISION}:${surface}:${seed}:${counter++}`).slice(0, 8), 16) % limit;
  const base = {type: 'replay', revision: REPLAY_REVISION, surface, seed, nonce, maxEvents: 64, maxDurationMs: 7000};
  if (surface === 'static-choice') return {...base, choices: 4, target: random(4), minResponseMs: 150};
  if (surface === 'drag-rotate') return {...base, start: {x: 100 + random(201), y: 100 + random(801)}, target: {x: 650 + random(251), y: 100 + random(801)}, targetAngle: (1 + random(3)) * 90, radius: 35, maxPixelsPerMs: 3, minResponseMs: 500};
  return {...base, choices: 4, cues: Array.from({length: 4}, (_, i) => ({choice: random(4), startsAtMs: 500 + i * 800, endsAtMs: 1200 + i * 800}))};
}

/** Replay submitted events against server-held state and server-observed elapsed time. */
export function replayEvents(challenge, response, {observedElapsedMs} = {}) {
  const reject = reason => ({ok: false, reason, revision: REPLAY_REVISION});
  if (challenge?.revision !== REPLAY_REVISION || !REPLAY_SURFACES.includes(challenge?.surface)) return reject('unsupported-world');
  if (!Number.isFinite(observedElapsedMs) || observedElapsedMs < 0 || observedElapsedMs > 15000) return reject('expired-or-invalid-clock');
  if (!keysAre(response, ['nonce', 'events', 'eventStreamHash']) || response.nonce !== challenge.nonce) return reject('wrong-nonce-or-response');
  const events = response.events;
  if (!Array.isArray(events) || events.length < 1 || events.length > challenge.maxEvents) return reject('event-limit');
  try { if (JSON.stringify(response).length > 16384) return reject('payload-limit'); } catch { return reject('invalid-payload'); }
  let previousTime = -1;
  for (const event of events) {
    if (!event || !integer(event.t, 0, challenge.maxDurationMs) || event.t <= previousTime) return reject('event-order-or-time');
    if (event.t > observedElapsedMs) return reject('future-event');
    previousTime = event.t;
    const shape = event.type === 'choose' ? ['type', 't', 'choice'] : event.type === 'rotate' ? ['type', 't', 'angle'] : ['type', 't', 'x', 'y'];
    if (!keysAre(event, shape)) return reject('event-shape');
    if (event.type === 'choose' && !integer(event.choice, 0, 3)) return reject('choice-bounds');
    if (event.type === 'rotate' && !integer(event.angle, 0, 359)) return reject('angle-bounds');
    if (['down', 'move', 'up'].includes(event.type) && (!integer(event.x, 0, 1000) || !integer(event.y, 0, 1000))) return reject('coordinate-bounds');
    if (!['choose', 'down', 'move', 'up', 'rotate'].includes(event.type)) return reject('unknown-event');
  }
  const hash = eventStreamHash(events);
  if (typeof response.eventStreamHash !== 'string' || response.eventStreamHash !== hash) return reject('event-hash-mismatch');
  let world;
  if (challenge.surface === 'static-choice') {
    if (events.length !== 1 || events[0].type !== 'choose' || events[0].choice !== challenge.target || events[0].t < challenge.minResponseMs) return reject('choice-mismatch');
    world = {selected: events[0].choice};
  } else if (challenge.surface === 'dynamic-sequence') {
    if (events.length !== challenge.cues.length) return reject('sequence-length');
    for (let i = 0; i < events.length; i++) {
      const event = events[i], cue = challenge.cues[i];
      if (event.type !== 'choose' || event.choice !== cue.choice || event.t < cue.startsAtMs || event.t >= cue.endsAtMs) return reject('sequence-rule-or-window');
    }
    world = {matchedCues: events.length};
  } else {
    if (events.length < 4 || events[0].type !== 'down' || distance(events[0], challenge.start) > challenge.radius || events.at(-1).type !== 'up' || events.at(-1).t < challenge.minResponseMs) return reject('drag-start-or-finish');
    let pointer = events[0], angle = 0, rotations = 0, moves = 0;
    for (let i = 1; i < events.length; i++) {
      const event = events[i];
      if (event.type === 'rotate') { angle = event.angle; rotations++; continue; }
      if (event.type !== 'move' && !(event.type === 'up' && i === events.length - 1)) return reject('drag-order');
      if (distance(event, pointer) > challenge.maxPixelsPerMs * (event.t - pointer.t)) return reject('drag-speed');
      pointer = event;
      if (event.type === 'move') moves++;
    }
    if (moves < 1 || rotations !== 1 || angle !== challenge.targetAngle || distance(pointer, challenge.target) > challenge.radius) return reject('drag-target-or-angle');
    world = {x: pointer.x, y: pointer.y, angle};
  }
  return {ok: true, revision: REPLAY_REVISION, assurance: 'interaction', eventStreamHash: hash, world, durationMs: events.at(-1).t, eventCount: events.length};
}

/** Explicit rule-aware script baseline. Success demonstrates that replay is not human proof. */
export function oracleEvents(challenge) {
  if (challenge.surface === 'static-choice') return [{type: 'choose', t: 500, choice: challenge.target}];
  if (challenge.surface === 'dynamic-sequence') return challenge.cues.map(cue => ({type: 'choose', t: cue.startsAtMs + 200, choice: cue.choice}));
  return [
    {type: 'down', t: 100, ...challenge.start},
    ...Array.from({length: 6}, (_, i) => ({type: 'move', t: 250 + i * 150, x: Math.round(challenge.start.x + (challenge.target.x - challenge.start.x) * (i + 1) / 6), y: Math.round(challenge.start.y + (challenge.target.y - challenge.start.y) * (i + 1) / 6)})),
    {type: 'rotate', t: 1200, angle: challenge.targetAngle},
    {type: 'up', t: 1400, ...challenge.target}
  ];
}

/** Experimental Kechap adapter; use Kechap's store for expiry, binding and one-use claims. */
export function replayAdapter({surface = 'dynamic-sequence', now = Date.now, seedFactory = () => randomBytes(16).toString('hex'), nonceFactory = () => randomBytes(24).toString('base64url')} = {}) {
  if (!REPLAY_SURFACES.includes(surface)) throw new Error('Unknown replay surface');
  return {
    assurance: 'interaction',
    async issue() {
      const challenge = createReplayChallenge({surface, seed: seedFactory(), nonce: nonceFactory()});
      return {public: structuredClone(challenge), private: {challenge, issuedAt: now()}};
    },
    async verify({response, state}) {
      try {
        if (typeof response !== 'string' || response.length > 16384) return false;
        return replayEvents(state.challenge, JSON.parse(response), {observedElapsedMs: now() - state.issuedAt}).ok;
      } catch { return false; }
    }
  };
}
