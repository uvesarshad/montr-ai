import { Queue } from 'bullmq';
import { getConnection } from './queue';

export interface WhatsAppCampaignJob {
    campaignId: string;
}

// Create WhatsApp Campaign Queue
export const whatsappCampaignQueue = new Queue<WhatsAppCampaignJob>('whatsapp-campaigns', {
    connection: getConnection(),
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: {
            age: 24 * 3600, // Keep completed jobs for 24 hours
            count: 1000,
        },
        removeOnFail: {
            age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
    },
});

/**
 * Add a campaign to the queue for processing
 */
export async function enqueueWhatsAppCampaign(campaignId: string) {
    const job = await whatsappCampaignQueue.add(
        'send-campaign',
        {
            campaignId
        },
        {
            jobId: `campaign-${campaignId}`,
        }
    );

    console.log(`Enqueued WhatsApp campaign ${campaignId} as job ${job.id}`);
    return job;
}
