// Browser entrypoint. It never receives provider secrets or authorizes an action.
const loads = new WeakMap();
const sources = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/api.js',
  hcaptcha: 'https://js.hcaptcha.com/1/api.js',
  recaptcha: 'https://www.google.com/recaptcha/api.js'
};

export function loadProviderSDK(provider, challenge, document = globalThis.document) {
  if (!Object.hasOwn(sources, provider)) return Promise.reject(new Error('Unsupported browser provider'));
  const recaptchaKey = provider === 'recaptcha' ? `${challenge.recaptchaMode}:${challenge.siteKey}` : '';
  let cache = loads.get(document);
  if (!cache) { cache = new Map(); loads.set(document, cache); }
  const previous = cache.get(provider);
  if (previous) {
    if (previous.key !== recaptchaKey) return Promise.reject(new Error('Use one reCAPTCHA mode and site key per page'));
    return previous.promise;
  }
  const window = document.defaultView;
  const promise = new Promise((resolve, reject) => {
    let settled = false;
    const callback = `kechapReady_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const url = new URL(sources[provider]);
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      delete window[callback];
      script.onerror = null;
      if (error) { script.remove(); reject(error); }
      else resolve(window[provider === 'recaptcha' ? 'grecaptcha' : provider]);
    };
    const timer = setTimeout(() => finish(new Error('Provider SDK load timed out')), 15000);
    window[callback] = () => finish();
    url.searchParams.set('onload', callback);
    url.searchParams.set('render', provider === 'recaptcha' && challenge.recaptchaMode === 'v3' ? challenge.siteKey : 'explicit');
    script.src = url.href;
    script.async = true;
    script.defer = true;
    script.onerror = () => finish(new Error('Provider SDK could not load'));
    document.head.append(script);
  });
  cache.set(provider, {key: recaptchaKey, promise});
  promise.catch(() => { if (cache.get(provider)?.promise === promise) cache.delete(provider); });
  return promise;
}

/** Mount one challenge. Cleanup suppresses old callbacks during rotation. */
export async function mountChallenge(container, issued, {onResponse, onError = () => {}, signal, sdkLoader = loadProviderSDK} = {}) {
  if (!container || typeof onResponse !== 'function') throw new Error('Container and onResponse required');
  const {challenge, expiresAt} = issued ?? {};
  if (!challenge || !Number.isFinite(expiresAt)) throw new Error('Issued challenge required');
  const document = container.ownerDocument;
  let disposed = false;
  let responded = false;
  let removeWidget = () => {};
  const controller = new AbortController();
  const cleanup = () => {
    if (disposed) return;
    disposed = true; controller.abort(); clearTimeout(timer);
    signal?.removeEventListener('abort', cleanup);
    try { removeWidget(); } finally { container.replaceChildren(); }
  };
  const fail = error => { if (!disposed) onError(error instanceof Error ? error : new Error('Verification unavailable')); };
  const emit = response => {
    if (disposed || responded) return;
    if (Date.now() >= expiresAt) { fail(new Error('Challenge expired; request another')); return; }
    if (typeof response === 'string' && response) {
      responded = true;
      Promise.resolve().then(() => { if (!disposed) return onResponse(response); }).catch(fail);
    }
  };
  const timer = setTimeout(() => { fail(new Error('Challenge expired; request another')); cleanup(); }, Math.max(0, expiresAt - Date.now()));
  if (signal?.aborted) { cleanup(); return cleanup; }
  signal?.addEventListener('abort', cleanup, {once: true});
  container.replaceChildren();
  try {
    if (Date.now() >= expiresAt) throw new Error('Challenge expired; request another');
    if (challenge.type === 'pow') {
      if (!Number.isInteger(challenge.difficulty) || challenge.difficulty < 1 || challenge.difficulty > 5 || !/^[a-f0-9]{48}$/.test(challenge.salt)) throw new Error('Invalid PoW challenge');
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = '기기에서 검증 작업 시작';
      const status = document.createElement('p'); status.setAttribute('role', 'status');
      status.textContent = '연산 작업은 사람의 존재를 증명하지 않습니다.';
      container.append(button, status);
      button.addEventListener('click', async () => {
        button.disabled = true; status.textContent = '기기에서 작업 중…';
        try {
          const encoder = new TextEncoder();
          for (let answer = 0; answer < 2000000; answer++) {
            if (controller.signal.aborted) return;
            if (Date.now() >= expiresAt) throw new Error('Challenge expired; request another');
            const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(`${challenge.salt}:${answer}`)));
            const hex = Array.from(hash, v => v.toString(16).padStart(2, '0')).join('');
            if (hex.startsWith('0'.repeat(challenge.difficulty))) { status.textContent = '작업 완료. 서버에서 확인합니다.'; emit(String(answer)); return; }
            if (answer % 128 === 0) await new Promise(resolve => setTimeout(resolve, 0));
          }
          throw new Error('Work limit reached; choose another method');
        } catch (error) { fail(error); }
      });
    } else {
      if (!Object.hasOwn(sources, challenge.type) || typeof challenge.siteKey !== 'string' || !challenge.siteKey) throw new Error('Unsupported widget configuration');
      if (challenge.type === 'turnstile' && !challenge.cData) throw new Error('Turnstile cData required');
      if (challenge.type === 'recaptcha' && !['v2', 'v3'].includes(challenge.recaptchaMode)) throw new Error('reCAPTCHA mode required');
      const sdk = await sdkLoader(challenge.type, challenge, document);
      if (disposed) return cleanup;
      if (challenge.type === 'recaptcha' && challenge.recaptchaMode === 'v3') {
        sdk.ready(() => {
          if (disposed) return;
          Promise.resolve().then(() => sdk.execute(challenge.siteKey, {action: challenge.action})).then(emit, fail);
        });
      } else {
        const options = {sitekey: challenge.siteKey, callback: emit, 'error-callback': () => fail(new Error('Provider verification failed')), 'expired-callback': () => fail(new Error('Provider token expired; request another'))};
        if (challenge.type === 'turnstile') Object.assign(options, {action: challenge.action, cData: challenge.cData});
        const widget = sdk.render(container, options);
        removeWidget = () => { try { if (sdk.remove) sdk.remove(widget); else sdk.reset(widget); } catch { /* DOM is removed below */ } };
      }
    }
  } catch (error) { fail(error); cleanup(); }
  return cleanup;
}
