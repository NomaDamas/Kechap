/** Browser UI for Kechap's owned toy worlds. Valid events are not human proof. */
export async function browserEventHash(events) {
  const canonical = events.map(event => Object.fromEntries(Object.keys(event).sort().map(key => [key, event[key]])));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function validateReplayWorld(world) {
  if (!world || world.type !== 'replay' || world.revision !== 'kechap-toy-replay-v1' || !['static-choice', 'drag-rotate', 'dynamic-sequence'].includes(world.surface)) throw new Error('Unsupported replay world');
  if (typeof world.nonce !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(world.nonce) || world.maxEvents !== 64 || world.maxDurationMs !== 7000) throw new Error('Invalid replay limits');
  const coordinate = point => point && Number.isInteger(point.x) && point.x >= 0 && point.x <= 1000 && Number.isInteger(point.y) && point.y >= 0 && point.y <= 1000;
  if (world.surface === 'static-choice' && (!Number.isInteger(world.target) || world.target < 0 || world.target > 3)) throw new Error('Invalid target');
  if (world.surface === 'drag-rotate' && (!coordinate(world.start) || !coordinate(world.target) || ![90, 180, 270].includes(world.targetAngle))) throw new Error('Invalid drag world');
  if (world.surface === 'dynamic-sequence' && (!Array.isArray(world.cues) || world.cues.length !== 4 || world.cues.some(cue => !Number.isInteger(cue.choice) || cue.choice < 0 || cue.choice > 3 || !Number.isInteger(cue.startsAtMs) || !Number.isInteger(cue.endsAtMs) || cue.startsAtMs < 0 || cue.startsAtMs >= cue.endsAtMs || cue.endsAtMs > 7000))) throw new Error('Invalid cue schedule');
}

export function mountReplayWorld(container, world, {onResponse, onError = () => {}, signal} = {}) {
  validateReplayWorld(world);
  if (!container?.ownerDocument || typeof onResponse !== 'function') throw new Error('Container and response callback required');
  const document = container.ownerDocument;
  const started = performance.now();
  const events = [];
  const timers = new Set();
  let disposed = false, submitted = false;
  const controller = new AbortController();
  const element = (tag, text, attrs = {}) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
    return node;
  };
  const status = element('p', '', {role: 'status', 'aria-live': 'polite'});
  const schedule = (fn, ms) => {const timer = setTimeout(() => {timers.delete(timer); if (!disposed) fn();}, ms); timers.add(timer);};
  const cleanup = () => {
    if (disposed) return;
    disposed = true; controller.abort();
    for (const timer of timers) clearTimeout(timer);
    timers.clear(); signal?.removeEventListener('abort', cleanup); container.replaceChildren();
  };
  const fail = message => {if (!disposed) {status.textContent = message; onError(new Error(message));}};
  const push = event => {
    if (disposed || submitted) return false;
    const t = Math.max(Math.floor(performance.now() - started), (events.at(-1)?.t ?? -1) + 1);
    if (t > world.maxDurationMs || events.length >= world.maxEvents) {fail('Event or time limit reached. Start again or use the product recovery route.'); return false;}
    events.push({...event, t}); return true;
  };
  const finish = async () => {
    if (disposed || submitted || !events.length) return;
    submitted = true;
    try {
      const eventStreamHash = await browserEventHash(events);
      if (disposed) return;
      status.textContent = 'Checking these interaction events on the server…';
      await onResponse(JSON.stringify({nonce: world.nonce, events, eventStreamHash}));
    } catch {fail('Interaction could not be verified. Start again or use product recovery.');}
  };
  const listen = (target, name, fn) => target.addEventListener(name, fn, {signal: controller.signal});
  container.replaceChildren();
  container.append(element('p', 'Research interaction only. Automation can complete these rules; no human-presence guarantee.'));
  if (signal?.aborted) {cleanup(); return cleanup;}
  signal?.addEventListener('abort', cleanup, {once: true});
  schedule(() => {if (!submitted) fail('Challenge expired. You can cancel or request a new challenge.');}, world.maxDurationMs);

  if (world.surface === 'static-choice' || world.surface === 'dynamic-sequence') {
    const prompt = element('p', world.surface === 'static-choice' ? `Choose tile ${world.target + 1}.` : 'Wait for each numbered cue, then select its tile.', {'data-cue': '', role: 'status', 'aria-live': 'polite'});
    const grid = element('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;max-width:500px';
    const buttons = [];
    let active = -1;
    const used = new Set();
    for (let choice = 0; choice < 4; choice++) {
      const button = element('button', `Tile ${choice + 1}`, {type: 'button', 'data-choice': choice});
      button.style.cssText = 'min-height:90px;font:inherit'; button.disabled = true;
      listen(button, 'click', () => {
        if (world.surface === 'dynamic-sequence') {
          if (active < 0 || used.has(active)) return;
          used.add(active);
          for (const b of buttons) b.disabled = true;
        }
        if (!push({type: 'choose', choice})) return;
        if (world.surface === 'static-choice' || events.length === 4) {
          for (const b of buttons) b.disabled = true;
          void finish();
        }
      });
      buttons.push(button); grid.append(button);
    }
    if (world.surface === 'static-choice') schedule(() => {for (const b of buttons) b.disabled = false;}, world.minResponseMs + 20);
    else for (let i = 0; i < world.cues.length; i++) {
      const cue = world.cues[i];
      schedule(() => {
        active = i; prompt.textContent = `Cue ${i + 1}: choose tile ${cue.choice + 1}.`;
        prompt.dataset.activeCue = String(i); prompt.dataset.activeChoice = String(cue.choice);
        for (const b of buttons) b.disabled = false;
      }, cue.startsAtMs + 20);
      schedule(() => {if (active === i) {for (const b of buttons) b.disabled = true; delete prompt.dataset.activeChoice;}}, cue.endsAtMs - 10);
    }
    container.append(prompt, grid, status);
  } else {
    const prompt = element('p', `Move the object into the target and rotate it to ${world.targetAngle}°. Keyboard: Space to pick up; arrows move 50 units (Shift: 10); R rotates 90°; Enter places.`);
    const board = element('div', undefined, {'data-board': '', 'aria-label': 'Drag and rotate board'});
    board.style.cssText = 'position:relative;width:min(500px,90vw);height:min(500px,90vw);min-height:300px;border:2px solid #333;touch-action:none;background:#f7f7ed';
    const target = element('div', 'Target');
    target.style.cssText = `position:absolute;left:${world.target.x / 10}%;top:${world.target.y / 10}%;transform:translate(-50%,-50%);width:45px;height:45px;border:3px dashed #276742;border-radius:50%;font-size:12px`;
    const object = element('button', '↑', {type: 'button', 'data-object': '', 'aria-label': 'Move and rotate object'});
    object.style.cssText = 'position:absolute;width:36px;height:36px;border:2px solid #204078;border-radius:4px;background:#dce9ff;font-size:24px';
    const rotate = element('button', 'Rotate 90°', {type: 'button'});
    const place = element('button', 'Place object', {type: 'button'});
    let position = {...world.start}, angle = 0, grabbed = false, finished = false;
    const draw = () => {object.style.left = position.x / 10 + '%'; object.style.top = position.y / 10 + '%'; object.style.transform = `translate(-50%,-50%) rotate(${angle}deg)`; object.setAttribute('aria-label', `Object at ${position.x}, ${position.y}, angle ${angle} degrees. Space picks up; arrows move; R rotates; Enter places.`);};
    const pickup = () => {if (finished || grabbed) return; grabbed = push({type: 'down', ...position}); object.setAttribute('aria-pressed', String(grabbed));};
    const move = (x, y) => {
      if (!grabbed || finished || events.length >= world.maxEvents - 2) return;
      const next = {x: Math.round(Math.max(0, Math.min(1000, x))), y: Math.round(Math.max(0, Math.min(1000, y)))};
      if (next.x === position.x && next.y === position.y) return;
      if (push({type: 'move', ...next})) {position = next; draw();}
    };
    const placeObject = () => {
      if (!grabbed || finished) return;
      if (!push({type: 'rotate', angle})) return;
      if (!push({type: 'up', ...position})) return;
      finished = true; object.disabled = true; place.disabled = true; rotate.disabled = true; void finish();
    };
    const rotateObject = () => {if (!finished) {angle = (angle + 90) % 360; draw(); status.textContent = `Object rotation: ${angle} degrees.`;}};
    const coordinates = event => {const rect = board.getBoundingClientRect(); return {x: (event.clientX - rect.left) / rect.width * 1000, y: (event.clientY - rect.top) / rect.height * 1000};};
    listen(object, 'pointerdown', event => {event.preventDefault(); object.focus(); pickup(); object.setPointerCapture?.(event.pointerId);});
    listen(object, 'pointermove', event => {if (grabbed && event.buttons) {const p = coordinates(event); move(p.x, p.y);}});
    listen(object, 'pointerup', event => {if (object.hasPointerCapture?.(event.pointerId)) object.releasePointerCapture(event.pointerId);});
    listen(object, 'keydown', event => {
      const step = event.shiftKey ? 10 : 50;
      if ([' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'r', 'R'].includes(event.key)) event.preventDefault();
      if (event.key === ' ') pickup();
      if (event.key === 'Enter') placeObject();
      if (event.key.toLowerCase() === 'r') rotateObject();
      const delta = {ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step]}[event.key];
      if (delta) move(position.x + delta[0], position.y + delta[1]);
    });
    listen(rotate, 'click', rotateObject); listen(place, 'click', placeObject);
    draw(); board.append(target, object); container.append(prompt, board, rotate, place, status);
  }
  return cleanup;
}
