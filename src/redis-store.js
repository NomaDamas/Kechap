import {createHash} from 'node:crypto';

// Both keys share the namespace's Redis Cluster hash tag. Each script is atomic.
const PUT = `
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local expires = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if expires <= now or expires - now > tonumber(ARGV[4]) then return 'expiry' end
if redis.call('EXISTS', KEYS[2]) == 1 then return 'exists' end
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 'capacity' end
redis.call('SET', KEYS[2], ARGV[1], 'PXAT', expires)
redis.call('ZADD', KEYS[1], expires, KEYS[2])
local last = redis.call('ZRANGE', KEYS[1], -1, -1, 'WITHSCORES')
redis.call('PEXPIREAT', KEYS[1], tonumber(last[2]))
return 'ok'
`;
const TAKE = `
local value = redis.call('GET', KEYS[2])
redis.call('DEL', KEYS[2])
redis.call('ZREM', KEYS[1], KEYS[2])
return value
`;
const COUNT = `
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
return redis.call('ZCARD', KEYS[1])
`;

export class StoreUnavailableError extends Error {
  constructor() {
    super('Shared verification store unavailable; operation may have committed. Do not replay the operation or accept verification.');
    this.name = 'StoreUnavailableError';
    this.code = 'KECHAP_STORE_UNAVAILABLE';
    this.outcomeMayHaveCommitted = true;
  }
}

/** Redis 6.2+ atomic TTL store. Share one namespace/config across every worker. */
export class RedisStore {
  constructor({client, namespace = 'kechap', maxEntries = 10000, maxValueBytes = 65536, timeoutMs = 3000, maxTtlMs = 300000} = {}) {
    if (!client || typeof client.sendCommand !== 'function') throw new Error('Connected Redis command client required');
    if (typeof namespace !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(namespace)) throw new Error('Namespace must contain 1..128 safe characters');
    if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 1000000) throw new Error('maxEntries must be 1..1000000');
    if (!Number.isInteger(maxValueBytes) || maxValueBytes < 1 || maxValueBytes > 1048576) throw new Error('maxValueBytes must be 1..1048576');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error('timeoutMs must be 1..30000');
    if (!Number.isInteger(maxTtlMs) || maxTtlMs < 1 || maxTtlMs > 300000) throw new Error('maxTtlMs must be 1..300000');
    Object.assign(this, {client, maxEntries, maxValueBytes, timeoutMs, maxTtlMs});
    this.prefix = `kechap:{${namespace}}:`;
    this.index = this.prefix + 'expiry';
  }
  key(key) {
    if (typeof key !== 'string' || !key || Buffer.byteLength(key) > 2048) throw new Error('Store key must be 1..2048 bytes');
    return this.prefix + 'data:' + createHash('sha256').update(key).digest('hex');
  }
  async command(parts) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => this.client.sendCommand(parts)),
        new Promise((_, reject) => {timer = setTimeout(() => reject(new StoreUnavailableError()), this.timeoutMs);})
      ]);
    } catch { throw new StoreUnavailableError(); }
    finally { clearTimeout(timer); }
  }
  async put(key, value, expiresAt) {
    const dataKey = this.key(key);
    if (!Number.isSafeInteger(expiresAt) || expiresAt < 1) throw new Error('Absolute integer expiry required');
    let encoded;
    try { encoded = JSON.stringify(value); } catch { throw new Error('Store value must be JSON serializable'); }
    if (encoded === undefined || Buffer.byteLength(encoded) > this.maxValueBytes) throw new Error('Store value missing or too large');
    const result = await this.command(['EVAL', PUT, '2', this.index, dataKey, encoded, String(expiresAt), String(this.maxEntries), String(this.maxTtlMs)]);
    if (result === 'capacity') throw new Error('Store capacity exceeded');
    if (result === 'exists') throw new Error('Store key already exists; refusing overwrite');
    if (result === 'expiry') throw new Error('Store expiry is elapsed or exceeds configured TTL');
    if (result !== 'ok') throw new StoreUnavailableError();
  }
  async take(key) {
    const raw = await this.command(['EVAL', TAKE, '2', this.index, this.key(key)]);
    if (raw === null) return undefined;
    try { return JSON.parse(raw); } catch { throw new StoreUnavailableError(); }
  }
  async count() {
    const result = await this.command(['EVAL', COUNT, '1', this.index]);
    if (!Number.isSafeInteger(result) || result < 0) throw new StoreUnavailableError();
    return result;
  }
}

/** No reconnect/offline replay: caller explicitly establishes a fresh connection. */
export async function connectRedisStore({url = process.env.REDIS_URL, connectTimeoutMs = 5000, ...options} = {}) {
  if (typeof url !== 'string' || !/^rediss?:\/\//.test(url)) throw new Error('REDIS_URL using redis:// or rediss:// required');
  try {
    const parsed = new URL(url);
    if (!parsed.hostname || !['redis:', 'rediss:'].includes(parsed.protocol)) throw new Error();
  } catch { throw new Error('Invalid Redis connection URL'); }
  if (!Number.isInteger(connectTimeoutMs) || connectTimeoutMs < 1 || connectTimeoutMs > 30000) throw new Error('Invalid Redis connection timeout');
  const {createClient} = await import('redis');
  const client = createClient({url, disableOfflineQueue: true, socket: {connectTimeout: connectTimeoutMs, reconnectStrategy: false}});
  const store = new RedisStore({client, ...options});
  // node-redis requires an error listener; never expose credentials or raw errors.
  client.on('error', () => {});
  try { await client.connect(); }
  catch { if (client.isOpen) client.destroy(); throw new StoreUnavailableError(); }
  return {store, close: async () => {if (client.isOpen) await client.close();}};
}
