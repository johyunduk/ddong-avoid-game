import { Redis } from '@upstash/redis';

// Redis 클라이언트 싱글톤 인스턴스
let redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error(
        'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set'
      );
    }

    redis = new Redis({
      url,
      token,
    });
  }

  return redis;
}
