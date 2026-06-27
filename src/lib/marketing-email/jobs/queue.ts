
import { Queue, ConnectionOptions } from 'bullmq';

// Reuse connection logic if possible, or duplicate for now to be safe/independent
const getRedisConnectionOptions = (): ConnectionOptions => {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const url = new URL(redisUrl);
    return {
        host: url.hostname || 'localhost',
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        maxRetriesPerRequest: null,
    };
};

let marketingEmailQueue: Queue | null = null;

export const getMarketingEmailQueue = (): Queue => {
    if (!marketingEmailQueue) {
        marketingEmailQueue = new Queue('marketing-email', {
            connection: getRedisConnectionOptions(),
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000,
                },
                removeOnComplete: {
                    age: 24 * 3600, // 24 hours
                    count: 1000,
                },
                removeOnFail: {
                    age: 7 * 24 * 3600, // 7 days
                },
            },
        });
    }
    return marketingEmailQueue;
};

export async function closeMarketingEmailQueue() {
    if (marketingEmailQueue) {
        await marketingEmailQueue.close();
        marketingEmailQueue = null;
    }
}
