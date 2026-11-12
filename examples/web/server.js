import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {Kechap, powAdapter, siteverifyAdapter} from '../../src/index.js';

export function configuredAdapters(env = process.env) {
  const providers = (env.KECHAP_PROVIDERS ?? 'pow').split(',');
  if (providers.includes('pow') && providers.length > 1) throw new Error('PoW cannot rotate with bot-mitigation providers');
  const adapters = {};
  for (const provider of providers) {
    if (provider === 'pow') { adapters.pow = powAdapter({difficulty: 2}); continue; }
    if (!['turnstile', 'hcaptcha', 'recaptcha'].includes(provider)) throw new Error('Unknown KECHAP_PROVIDERS value');
    const prefix = provider.toUpperCase();
    adapters[provider] = siteverifyAdapter({provider, siteKey: env[`${prefix}_SITE_KEY`], secret: env[`${prefix}_SECRET`], hostname: env.KECHAP_HOSTNAME ?? 'localhost', ...(provider !== 'hcaptcha' && !(provider === 'recaptcha' && env.RECAPTCHA_MODE === 'v2') ? {action: 'signup'} : {}), ...(provider === 'recaptcha' ? {recaptchaMode: env.RECAPTCHA_MODE, ...(env.RECAPTCHA_MODE === 'v3' ? {minScore: Number(env.RECAPTCHA_MIN_SCORE ?? 0.7)} : {})} : {})});
  }
  return {adapters, providers, assurance: providers[0] === 'pow' ? 'automation-cost' : 'bot-mitigation'};
}

/** Local integration example; not a production session/authentication server. */
export function createDemoHandler({adapters, providers = Object.keys(adapters), assurance, now = Date.now, origin = 'http://localhost:3000'} = {}) {
  const kechap = new Kechap({adapters, now});
  const sessions = new Map();
  const assets = new Map([
    ['/', [new URL('./index.html', import.meta.url), 'text/html; charset=utf-8']],
    ['/app.js', [new URL('./app.js', import.meta.url), 'text/javascript; charset=utf-8']],
    ['/browser.js', [new URL('../../src/browser.js', import.meta.url), 'text/javascript; charset=utf-8']]
  ]);
  return async (req, res) => {
    const expectedOrigin = typeof origin === 'function' ? origin() : origin;
    const send = (status, value, headers = {}) => {
      res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers});
      res.end(JSON.stringify(value));
    };
    if (req.headers.host !== new URL(expectedOrigin).host) return send(403, {error: 'Unexpected host'});
    if (req.method === 'GET' && assets.has(req.url)) {
      try {
        const [file, type] = assets.get(req.url);
        res.writeHead(200, {'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'});
        res.end(await readFile(file));
      } catch { if (!res.headersSent) send(500, {error: 'Asset unavailable'}); else res.end(); }
      return;
    }
    for (const [key, session] of sessions) if (session.expiresAt <= now()) sessions.delete(key);
    if (req.method === 'GET' && req.url === '/api/session') {
      if (sessions.size >= 1000) return send(503, {error: 'Demo session capacity reached'});
      const id = randomBytes(24).toString('base64url');
      const csrf = randomBytes(24).toString('base64url');
      sessions.set(id, {csrf, expiresAt: now() + 900000, calls: 0});
      return send(200, {csrf, assurance, providers}, {'Set-Cookie': `kechap_demo=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=900`});
    }
    if (req.method !== 'POST' || !['/api/challenge', '/api/verify', '/api/signup'].includes(req.url)) return send(404, {error: 'Not found'});
    if (req.headers.origin !== expectedOrigin || req.headers['content-type']?.split(';')[0] !== 'application/json') return send(403, {error: 'Same-origin JSON request required'});
    const id = /(?:^|;\s*)kechap_demo=([A-Za-z0-9_-]+)/.exec(req.headers.cookie ?? '')?.[1];
    const session = sessions.get(id);
    if (!session || req.headers['x-kechap-csrf'] !== session.csrf) return send(403, {error: 'Session or CSRF check failed'});
    if (++session.calls > 60) return send(429, {error: 'Demo session request limit reached'});
    const context = {tenant: 'kechap-demo', action: 'signup', subject: id};
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32768) { send(413, {error: 'Request too large'}); return; }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, {error: 'Invalid JSON'}); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return send(400, {error: 'JSON object required'});
      if (req.url === '/api/challenge') {
        const issued = await kechap.issue({context, sessionId: id, providers, assurance, mode: 'rotate', previous: session.previous});
        session.previous = issued.provider;
        return send(200, issued);
      }
      if (req.url === '/api/verify') {
        const result = await kechap.verify({id: body.id, response: body.response, context});
        return send(result.ok ? 200 : 403, result);
      }
      const consumed = await kechap.consume({token: body.token, context});
      if (!consumed.ok) return send(403, consumed);
      // Demonstrate a protected action; this example does not create accounts.
      return send(200, {ok: true, message: '데모 요청이 접수되었습니다. 계정은 생성하지 않습니다.', assurance: consumed.assurance, provider: consumed.provider});
    } catch { send(503, {error: 'Verification unavailable; request a new challenge'}); }
  };
}

export function createDemoServer(options) {
  const server = createServer(createDemoHandler({...options, origin: () => `http://localhost:${server.address().port}`}));
  server.requestTimeout = 10000;
  return server;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const port = Number(process.env.PORT ?? 3000);
  const server = createDemoServer(configuredAdapters());
  server.listen(port, '127.0.0.1', () => console.log(`Kechap local demo: http://localhost:${server.address().port}`));
}
