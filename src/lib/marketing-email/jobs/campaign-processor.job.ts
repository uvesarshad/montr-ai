
import { Worker, Job } from 'bullmq';
import { getMarketingEmailQueue } from './queue';
import { campaignService } from '../services/campaign.service';

export interface CampaignJobData {
    campaignId: string;
}

export const CAMPAIGN_PROCESS_JOB_NAME = 'process-campaign-batch';

/**
 * Add a campaign processing job to the queue
 */
export async function scheduleCampaignProcessing(campaignId: string, delay: number = 0) {
    const queue = getMarketingEmailQueue();
    await queue.add(CAMPAIGN_PROCESS_JOB_NAME, { campaignId }, {
        delay,
        jobId: `campaign-${campaignId}-${Date.now()}` // Unique ID for each batch attempt
    });
}

/**
 * Worker to process campaign jobs
 * This should be initialized in the server startup (e.g. instrumentation.ts or separate worker process)
 */
let campaignWorker: Worker | null = null;

export function initCampaignWorker() {
    if (campaignWorker) return;

    const connection = getMarketingEmailQueue().opts.connection;

    campaignWorker = new Worker('marketing-email', async (job: Job<CampaignJobData>) => {
        if (job.name === CAMPAIGN_PROCESS_JOB_NAME) {
            const { campaignId } = job.data;
            try {
                // Process a batch
                const result = await campaignService.processCampaignBatch(campaignId);

                // If not completed, reschedule immediately (or with delay) to process next batch
                if (!result.completed) {
                    await scheduleCampaignProcessing(campaignId, 1000); // 1s delay between batches
                } else {
                    console.log(`Campaign ${campaignId} completed.`);
                }
            } catch (error) {
                console.error(`Failed to process campaign batch for ${campaignId}`, error);
                throw error; // Let BullMQ handle retries
            }
        }
    }, {
        connection,
        concurrency: 5, // Process up to 5 campaigns/batches in parallel
    });

    campaignWorker.on('failed', (job, err) => {
        console.error(`Campaign job ${job?.id} failed:`, err);
    });
}

export async function closeCampaignWorker() {
    if (campaignWorker) {
        await campaignWorker.close();
        campaignWorker = null;
    }
}
