/**
 * Small in-process sliding-window rate limiter for voice endpoints.
 *
 * This is real enforcement for a single Node instance (the hackathon demo).
 * A multi-instance deployment must replace the store with a shared one
 * (Redis/Upstash); the interface is deliberately tiny so that swap is local.
 *
 * Keys are user ids, never transcripts or health data.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
};

type Scope = Map<string, number[]>;
const stores = new Map<string, Scope>();
const MAX_KEYS_PER_SCOPE = 5_000;

export function checkRateLimit(
  scope: string,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  let store = stores.get(scope);
  if (!store) {
    store = new Map();
    stores.set(scope, store);
  }

  if (store.size > MAX_KEYS_PER_SCOPE) store.clear();

  const cutoff = now - windowMs;
  const timestamps = (store.get(key) ?? []).filter((timestamp) => timestamp > cutoff);

  if (timestamps.length >= limit) {
    const oldest = timestamps[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    store.set(key, timestamps);
    return { allowed: false, remaining: 0, retryAfterSeconds, limit };
  }

  timestamps.push(now);
  store.set(key, timestamps);
  return {
    allowed: true,
    remaining: Math.max(0, limit - timestamps.length),
    retryAfterSeconds: 0,
    limit,
  };
}

export function resetRateLimits(scope?: string) {
  if (scope) stores.delete(scope);
  else stores.clear();
}

export const RATE_LIMIT_RULES = {
  assistant: { limit: 20, windowMs: 60_000 },
  transcribe: { limit: 10, windowMs: 60_000 },
  speak: { limit: 20, windowMs: 60_000 },
} as const;
