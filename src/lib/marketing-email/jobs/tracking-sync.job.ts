
/**
 * Job to sync tracking data from external providers (e.g. Brevo/SES)
 * This is useful if webhooks are missed or for periodic reconciliation.
 * 
 * Currently a placeholder to be implemented based on specific provider APIs for pulling stats.
 */

import { getMarketingEmailQueue } from './queue';

export const TRACKING_SYNC_JOB_NAME = 'sync-tracking-data';

export async function scheduleTrackingSync() {
    const queue = getMarketingEmailQueue();
    // Schedule a recurring job
    await queue.add(TRACKING_SYNC_JOB_NAME, {}, {
        repeat: {
            every: 3600000, // Every hour
        }
    });
}
