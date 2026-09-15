import type { FastifyReply, FastifyRequest } from 'fastify';

export type AuthRateLimitPolicy = Readonly<{
  max: number;
  windowMs: number;
}>;

type AuthRateLimitBucket = Readonly<{
  count: number;
  resetAt: number;
}>;

const MAX_TRACKED_AUTH_CLIENTS = 10_000;

/** Remove expired buckets and keep the in-memory limiter bounded. */
function makeRoomForBucket(buckets: Map<string, AuthRateLimitBucket>, now: number): void {
  if (buckets.size < MAX_TRACKED_AUTH_CLIENTS) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  if (buckets.size < MAX_TRACKED_AUTH_CLIENTS) return;
  const oldestKey = buckets.keys().next().value as string | undefined;
  if (oldestKey) buckets.delete(oldestKey);
}

/** Create one app-local fixed-window limiter for public authentication commands. */
export function createAuthRateLimiter() {
  const buckets = new Map<string, AuthRateLimitBucket>();

  return Object.freeze({
    hook(scope: string, policy: AuthRateLimitPolicy) {
      return async (request: FastifyRequest, reply: FastifyReply) => {
        const now = Date.now();
        const key = `${scope}:${request.ip}`;
        const bucket = buckets.get(key);

        if (!bucket || bucket.resetAt <= now) {
          if (bucket) buckets.delete(key);
          makeRoomForBucket(buckets, now);
          buckets.set(key, { count: 1, resetAt: now + policy.windowMs });
          return;
        }

        if (bucket.count >= policy.max) {
          const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
          return reply
            .header('Retry-After', String(retryAfterSeconds))
            .code(429)
            .send({
              error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many requests. Please try again later.',
                requestId: request.id
              }
            });
        }

        buckets.set(key, { count: bucket.count + 1, resetAt: bucket.resetAt });
      };
    }
  });
}
