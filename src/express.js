import express from 'express';

/** Mount behind existing product auth. Product callbacks remain authoritative. */
export function createKechapRouter({kechap, allowedOrigins, resolveSession, checkCSRF, rateLimit, policy, riskFor, healthFor = () => ({}), execute} = {}) {
  if (!kechap || !Array.isArray(allowedOrigins) || !allowedOrigins.length || allowedOrigins.some(origin => new URL(origin).origin !== origin) || [resolveSession, checkCSRF, rateLimit, riskFor, healthFor, execute].some(fn => typeof fn !== 'function')) throw new Error('Explicit product session, CSRF, rate-limit, risk and action callbacks required');
  const router = express.Router();
  router.use(express.json({limit: '32kb', strict: true}));
  router.use(async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      if (req.method !== 'POST' || !allowedOrigins.includes(req.get('origin')) || !req.is('application/json')) return res.status(403).json({ok: false});
      const session = await resolveSession(req);
      if (!session || typeof session.sessionId !== 'string' || !session.sessionId || !session.context) return res.status(401).json({ok: false});
      if (await checkCSRF(req, session) !== true) return res.status(403).json({ok: false});
      if (await rateLimit(req, session) !== true) return res.status(429).json({ok: false});
      res.locals.kechapSession = session; next();
    } catch {return res.status(503).json({ok: false, error: 'Product verification unavailable'});}
  });
  router.post('/challenge', async (req, res) => {
    const session = res.locals.kechapSession;
    try {
      const result = await kechap.issueWithPolicy({context: session.context, sessionId: session.sessionId, policy, risk: await riskFor(req, session), health: await healthFor(req, session), requiredAssurance: session.requiredAssurance});
      return res.json(result);
    } catch {return res.status(503).json({ok: false, error: 'No allowed verification route available'});}
  });
  router.post('/verify', async (req, res) => {
    try {
      const result = await kechap.verify({id: req.body?.id, response: req.body?.response, context: res.locals.kechapSession.context});
      return res.status(result.ok ? 200 : 403).json(result);
    } catch {return res.status(503).json({ok: false});}
  });
  router.post('/execute', async (req, res) => {
    try {
      const session = res.locals.kechapSession;
      const proof = await kechap.consume({token: req.body?.token, context: session.context});
      if (!proof.ok) return res.status(403).json({ok: false});
      const result = await execute({request: req, session, proof});
      return res.json({ok: true, result});
    } catch {return res.status(503).json({ok: false, error: 'Action outcome uncertain; use product idempotency recovery'});}
  });
  router.use((error, req, res, next) => res.status(error?.status === 413 ? 413 : 400).json({ok: false, error: 'Invalid request'}));
  return router;
}
