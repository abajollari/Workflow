import Redis from 'ioredis';

const url = process.env.REDIS_URL;

// Two separate connections required by ioredis: one for publish, one for subscribe.
export const redisPub = url ? new Redis(url, { lazyConnect: true }) : null;
export const redisSub = url ? new Redis(url, { lazyConnect: true }) : null;

if (url) {
  redisPub!.connect().catch((err) => console.error('[redis] pub connect failed:', err));
  redisSub!.connect().catch((err) => console.error('[redis] sub connect failed:', err));
  console.log('[redis] connecting to', url);
}
