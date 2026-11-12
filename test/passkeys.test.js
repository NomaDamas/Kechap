import test from 'node:test';
import assert from 'node:assert/strict';
import {createPasskeyService, MemoryCredentials} from '../src/passkeys.js';
const context = {tenant: 't', action: 'signup', subject: 's'};
const config = {rpID: 'localhost', rpName: 'Kechap test', origin: 'http://localhost:3000', authorizeEnrollment: () => true};
test('passkey enrollment requires explicit prior authorization and exact RP origin', async () => {
  assert.throws(() => createPasskeyService({...config, authorizeEnrollment: undefined}));
  assert.throws(() => createPasskeyService({...config, origin: 'http://attacker.invalid'}));
  const service = createPasskeyService({...config, authorizeEnrollment: () => false});
  await assert.rejects(service.beginRegistration({context}), /not authorized/);
  await assert.rejects(service.beginAuthentication({context}), /previously enrolled/);
});
test('invalid WebAuthn response never becomes a human claim or recovery token', async () => {
  const service = createPasskeyService(config);
  const challenge = await service.beginRegistration({context});
  assert.equal(challenge.options.authenticatorSelection.userVerification, 'required');
  assert.equal((await service.finishRegistration({context, id: challenge.id, response: {}})).ok, false);
  assert.equal((await service.finishRegistration({context, id: challenge.id, response: {}})).ok, false);
  assert.equal((await service.consumeRecovery({context, token: 'x'.repeat(43)})).ok, false);
});
test('development credential repository rejects duplicates and counter races', async () => {
  const db = new MemoryCredentials();
  assert.equal(await db.add('owner', {id: 'a', counter: 1}), true);
  assert.equal(await db.add('attacker', {id: 'a', counter: 0}), false);
  assert.deepEqual(await db.list('attacker'), []);
  const updates = await Promise.all([db.updateCounter('owner', 'a', 1, 2), db.updateCounter('owner', 'a', 1, 3)]);
  assert.equal(updates.filter(Boolean).length, 1);
  await db.deleteUser('owner'); assert.deepEqual(await db.list('owner'), []);
});
