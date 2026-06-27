import { Redis } from 'ioredis';

/**
 * Redis client singleton
 * 
 * Uses REDIS_URL env variable or falls back to localhost
 */

let redis: Redis | null = null;

export function getRedisClient(): Redis {
    if (!redis) {
        const url = process.env.REDIS_URL || 'redis://localhost:6379';

        redis = new Redis(url, {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: true,
        });

        redis!.on('error', (err) => {
            console.error('Redis connection error:', err);
        });

        redis!.on('connect', () => {
            console.log('Redis connected');
        });
    }

    return redis!;
}

/**
 * Check if Redis is available
 */
export async function isRedisAvailable(): Promise<boolean> {
    try {
        const client = getRedisClient();
        await client.ping();
        return true;
    } catch {
        return false;
    }
}

/**
 * Gracefully close Redis connection
 */
export async function closeRedis(): Promise<void> {
    if (redis) {
        await redis.quit();
        redis = null;
    }
}
