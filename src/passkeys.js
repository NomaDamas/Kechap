import {createHash, randomBytes} from 'node:crypto';
import {MemoryStore} from './index.js';

const binding = context => {
  if (!context || ['tenant', 'action', 'subject'].some(key => typeof context[key] !== 'string' || !context[key] || context[key].length > 512)) throw new Error('Trusted product context required');
  return createHash('sha256').update(JSON.stringify([context.tenant, context.action, context.subject])).digest('hex');
};
const owner = context => createHash('sha256').update(JSON.stringify([context.tenant, context.subject])).digest('hex');
const key = value => createHash('sha256').update(value).digest('hex');

/** Single-process development repository. Production requires atomic uniqueness/CAS. */
export class MemoryCredentials {
  constructor({maxCredentials = 10000} = {}) {this.records = new Map(); this.maxCredentials = maxCredentials;}
  async list(user) {return [...this.records.values()].filter(v => v.user === user).map(v => structuredClone(v.credential));}
  async add(user, credential) {
    if (this.records.has(credential.id) || this.records.size >= this.maxCredentials) return false;
    this.records.set(credential.id, {user, credential: structuredClone(credential)}); return true;
  }
  async updateCounter(user, id, expected, counter) {
    const record = this.records.get(id);
    if (!record || record.user !== user || record.credential.counter !== expected) return false;
    record.credential.counter = counter; return true;
  }
  async deleteUser(user) {for (const [id, record] of this.records) if (record.user === user) this.records.delete(id);}
}

/** An explicit account-continuity alternative, never a CAPTCHA/liveness substitute claim. */
export function createPasskeyService({rpID, rpName, origin, authorizeEnrollment, store, credentials = new MemoryCredentials(), now = Date.now, ttlMs = 120000} = {}) {
  if (typeof authorizeEnrollment !== 'function') throw new Error('Enrollment must require prior product authorization');
  const url = new URL(origin);
  if (url.hostname !== rpID || !['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && url.hostname !== 'localhost') || url.origin !== origin) throw new Error('Exact HTTPS origin/RP ID required (localhost HTTP development allowed)');
  if (!Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > 300000) throw new Error('Passkey TTL must be 1000..300000ms');
  const stateStore = store ?? new MemoryStore({now});
  const save = async (kind, context, challenge) => {
    const id = randomBytes(24).toString('base64url');
    await stateStore.put(`passkey:${id}`, {kind, binding: binding(context), challenge}, now() + ttlMs);
    return id;
  };
  const take = async (kind, context, id) => {
    const bound = binding(context);
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(id)) return null;
    const record = await stateStore.take(`passkey:${id}`);
    return record?.kind === kind && record.binding === bound ? record : null;
  };
  return {
    async beginRegistration({context}) {
      const {generateRegistrationOptions} = await import('@simplewebauthn/server');
      binding(context);
      if (await authorizeEnrollment(context) !== true) throw new Error('Enrollment not authorized');
      const user = owner(context), registered = await credentials.list(user);
      if (registered.length >= 5) throw new Error('Credential limit reached');
      const options = await generateRegistrationOptions({rpID, rpName, userName: user, userID: new TextEncoder().encode(user.slice(0, 32)), attestationType: 'none', authenticatorSelection: {residentKey: 'required', userVerification: 'required'}, excludeCredentials: registered.map(c => ({id: c.id, transports: c.transports}))});
      return {id: await save('register', context, options.challenge), options};
    },
    async finishRegistration({context, id, response}) {
      const state = await take('register', context, id);
      if (!state || await authorizeEnrollment(context) !== true) return {ok: false};
      try {
        const {verifyRegistrationResponse} = await import('@simplewebauthn/server');
        const result = await verifyRegistrationResponse({response, expectedChallenge: state.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true});
        if (!result.verified || !await credentials.add(owner(context), result.registrationInfo.credential)) return {ok: false};
        return {ok: true, assurance: 'account-continuity'};
      } catch {return {ok: false};}
    },
    async beginAuthentication({context}) {
      const {generateAuthenticationOptions} = await import('@simplewebauthn/server');
      binding(context);
      const registered = await credentials.list(owner(context));
      if (!registered.length) throw new Error('No previously enrolled passkey; use product recovery');
      const options = await generateAuthenticationOptions({rpID, userVerification: 'required', allowCredentials: registered.map(c => ({id: c.id, transports: c.transports}))});
      return {id: await save('authenticate', context, options.challenge), options};
    },
    async finishAuthentication({context, id, response}) {
      const state = await take('authenticate', context, id);
      if (!state) return {ok: false};
      const user = owner(context), credential = (await credentials.list(user)).find(c => c.id === response?.id);
      if (!credential) return {ok: false};
      try {
        const {verifyAuthenticationResponse} = await import('@simplewebauthn/server');
        const result = await verifyAuthenticationResponse({response, expectedChallenge: state.challenge, expectedOrigin: origin, expectedRPID: rpID, credential, requireUserVerification: true});
        if (!result.verified || !await credentials.updateCounter(user, credential.id, credential.counter, result.authenticationInfo.newCounter)) return {ok: false};
        const token = randomBytes(32).toString('base64url');
        await stateStore.put(`passkey-recovery:${key(token)}`, {binding: binding(context)}, now() + ttlMs);
        return {ok: true, token, assurance: 'account-continuity'};
      } catch {return {ok: false};}
    },
    async consumeRecovery({context, token}) {
      const bound = binding(context);
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return {ok: false};
      const record = await stateStore.take(`passkey-recovery:${key(token)}`);
      return {ok: record?.binding === bound, assurance: 'account-continuity'};
    },
    async deleteCredentials({context}) {
      binding(context);
      if (await authorizeEnrollment(context) !== true) throw new Error('Deletion requires product authorization');
      await credentials.deleteUser(owner(context));
    }
  };
}
