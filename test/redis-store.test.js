import test from 'node:test';
import assert from 'node:assert/strict';
import {RedisStore, StoreUnavailableError, connectRedisStore} from '../src/redis-store.js';

test('Redis store separates safe namespace and hashes keys, validates before sending', async () => {
  const commands = [];
  const store = new RedisStore({namespace: 'product-a', client: {sendCommand: async parts => {commands.push(parts); return 'ok';}}});
  await store.put('secret-opaque-token', {hello: 'world'}, Date.now() + 1000);
  assert.equal(commands.length, 1);
  assert.equal(commands[0][2], '2');
  assert.match(commands[0][3], /\{product-a\}/);
  assert.match(commands[0][4], /\{product-a\}/);
  assert.equal(commands[0].join(' ').includes('secret-opaque-token'), false);
  await assert.rejects(store.put('key', undefined, Date.now() + 1000));
  const cyclic = {}; cyclic.self = cyclic;
  await assert.rejects(store.put('key', cyclic, Date.now() + 1000));
  await assert.rejects(store.put('', {}, Date.now() + 1000));
  await assert.rejects(store.put('key', {}, NaN));
  assert.equal(commands.length, 1);
  assert.throws(() => new RedisStore({client: store.client, namespace: 'bad{tag}'}));
});
test('Redis store fails closed without leaking backend errors or implicitly retrying', async () => {
  let calls = 0;
  const store = new RedisStore({client: {sendCommand: async () => {calls++; throw new Error('redis://password@server');}}});
  await assert.rejects(store.take('proof'), error => error instanceof StoreUnavailableError && !error.message.includes('password') && error.outcomeMayHaveCommitted);
  assert.equal(calls, 1);
  const slow = new RedisStore({timeoutMs: 5, client: {sendCommand: async () => new Promise(resolve => setTimeout(() => resolve('never trusted'), 20))}});
  await assert.rejects(slow.take('proof'), {code: 'KECHAP_STORE_UNAVAILABLE'});
});
test('Redis store checks results, capacity and corrupted consumed state', async () => {
  const value = raw => new RedisStore({client: {sendCommand: async () => raw}});
  assert.equal(await value(null).take('missing'), undefined);
  assert.deepEqual(await value('{"ok":true}').take('value'), {ok: true});
  await assert.rejects(value('bad-json').take('value'), StoreUnavailableError);
  await assert.rejects(value('capacity').put('key', {}, Date.now() + 1000), /capacity/);
  await assert.rejects(value('exists').put('key', {}, Date.now() + 1000), /overwrite/);
  await assert.rejects(value('expiry').put('key', {}, Date.now() + 1000), /expiry/);
  await assert.rejects(value('unrecognized').put('key', {}, Date.now() + 1000), StoreUnavailableError);
  assert.equal(await value(3).count(), 3);
  await assert.rejects(value('3').count(), StoreUnavailableError);
  await assert.rejects(connectRedisStore({url: 'https://attacker.invalid'}), /REDIS_URL/);
});
