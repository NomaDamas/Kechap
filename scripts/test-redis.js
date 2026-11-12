import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Kechap} from '../src/index.js';
import {connectRedisStore, RedisStore, StoreUnavailableError} from '../src/redis-store.js';

const fixtureAdapter = {
  assurance: 'bot-mitigation',
  issue: async () => ({public: {}, private: {}}),
  verify: async ({response}) => response === 'owned-valid-proof'
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const url = process.env.REDIS_URL;

if (process.argv.includes('--worker')) {
  let connection;
  process.on('message', async message => {
    try {
      if (message.operation === 'connect') {
        connection = await connectRedisStore({url, namespace: message.namespace});
        process.send({ready: true});
      } else if (message.operation === 'crash-after-take') {
        await connection.store.take(message.key);
        process.exit(17); // Model worker death after the atomic state change.
      } else {
        const kechap = new Kechap({adapters: {owned: fixtureAdapter}, store: connection.store});
        const results = await Promise.all(Array.from({length: message.requests}, () => message.operation === 'verify'
          ? kechap.verify({id: message.id, context: message.context, response: 'owned-valid-proof'})
          : kechap.consume({token: message.token, context: message.context})));
        await connection.close();
        process.send({successes: results.filter(result => result.ok).length, token: results.find(result => result.token)?.token});
        process.disconnect();
      }
    } catch {
      await connection?.close().catch(() => {});
      process.send({error: 'Worker store operation failed'});
      process.disconnect();
      process.exitCode = 1;
    }
  });
} else {
  if (!url) throw new Error('Set REDIS_URL to an owned Redis 6.2+ test instance. This integration test never skips.');
  const namespace = 'kechaptest_' + randomBytes(12).toString('hex');
  const connection = await connectRedisStore({url, namespace});
  const context = {tenant: 'redis-test', action: 'owned-form', subject: randomBytes(16).toString('hex')};
  const children = new Set();
  async function startWorker() {
    const worker = fork(fileURLToPath(import.meta.url), ['--worker'], {stdio: ['ignore', 'ignore', 'ignore', 'ipc']});
    children.add(worker);
    const connected = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Redis worker connection timed out')), 10000);
      worker.once('message', message => {clearTimeout(timeout); resolve([message]);});
      worker.once('exit', code => {clearTimeout(timeout); reject(new Error(`Redis worker exited before ready (${code})`));});
      worker.once('error', error => {clearTimeout(timeout); reject(error);});
    });
    worker.send({operation: 'connect', namespace});
    const [message] = await connected;
    assert.equal(message.ready, true, 'Redis worker connection must succeed');
    worker.once('exit', () => children.delete(worker));
    return worker;
  }
  async function parallel(operation, data) {
    // Five independent Node processes establish Redis connections before the barrier.
    const workers = await Promise.all(Array.from({length: 5}, startWorker));
    const responses = workers.map(worker => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Multiprocess store test timed out')), 15000);
      worker.once('message', value => {clearTimeout(timeout); value.error ? reject(new Error(value.error)) : resolve(value);});
      worker.once('error', reject);
    }));
    for (const worker of workers) worker.send({operation, requests: 20, context, ...data});
    return Promise.all(responses);
  }
  const report = {schemaVersion: 1, testedAt: new Date().toISOString(), scope: 'Owned Redis integration; no external CAPTCHA evaluated', workers: 5, concurrentRequestsPerPhase: 100};
  try {
    const info = await connection.store.client.sendCommand(['INFO', 'server']);
    report.redisVersion = /^redis_version:(.+)$/m.exec(info)?.[1]?.trim();
    const kechap = new Kechap({adapters: {owned: fixtureAdapter}, store: connection.store});
    const issued = await kechap.issue({context, providers: ['owned'], assurance: 'bot-mitigation', sessionId: 'server-session'});
    const verified = await parallel('verify', {id: issued.id});
    report.successfulVerifications = verified.reduce((total, r) => total + r.successes, 0);
    assert.equal(report.successfulVerifications, 1);
    const token = verified.find(result => result.token).token;
    const consumed = await parallel('consume', {token});
    report.successfulConsumptions = consumed.reduce((total, r) => total + r.successes, 0);
    assert.equal(report.successfulConsumptions, 1);

    const limited = new RedisStore({client: connection.store.client, namespace: namespace + '_bounds', maxEntries: 2, maxTtlMs: 2000});
    await limited.put('a', {a: 1}, Date.now() + 180);
    await limited.put('b', {b: 2}, Date.now() + 180);
    await assert.rejects(limited.put('c', {}, Date.now() + 1000), /capacity/);
    await assert.rejects(limited.put('a', {}, Date.now() + 1000), /overwrite/);
    assert.equal(await limited.count(), 2);
    await wait(240);
    assert.equal(await limited.take('a'), undefined);
    assert.equal(await limited.count(), 0);
    await limited.put('c', {afterExpiry: true}, Date.now() + 1000);
    assert.deepEqual(await limited.take('c'), {afterExpiry: true});
    await assert.rejects(limited.put('past', {}, Date.now() - 1), /expiry/);
    await assert.rejects(limited.put('far-future', {}, Date.now() + 5000), /expiry/);
    assert.equal(await connection.store.client.sendCommand(['EXISTS', limited.index]), 0);
    report.ttlCapacityCleanup = 'passed';

    await connection.store.put('ambiguous-response', {onlyOnce: true}, Date.now() + 1000);
    const ambiguous = new RedisStore({namespace, timeoutMs: 5, client: {sendCommand: async parts => {
      const answer = await connection.store.client.sendCommand(parts);
      await wait(30); return answer;
    }}});
    await assert.rejects(ambiguous.take('ambiguous-response'), StoreUnavailableError);
    assert.equal(await connection.store.take('ambiguous-response'), undefined);
    report.responseTimeoutAfterCommit = 'failed-closed-without-retry';

    await connection.store.put('crash-key', {once: true}, Date.now() + 1000);
    const crashWorker = await startWorker();
    const crashed = once(crashWorker, 'exit');
    crashWorker.send({operation: 'crash-after-take', key: 'crash-key'});
    const [code] = await crashed;
    assert.equal(code, 17);
    assert.equal(await connection.store.take('crash-key'), undefined);
    report.workerCrashAfterCommit = 'state-remains-consumed';
    report.pass = true;
    await mkdir('.local/redis', {recursive: true});
    await writeFile('.local/redis/report.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    for (const child of children) child.kill();
    await connection.close();
  }
}
