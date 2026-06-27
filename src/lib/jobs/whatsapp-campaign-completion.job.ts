import { whatsappCampaignRepository } from '@/lib/db/repository/whatsapp-campaign.repository';
import { whatsappMessageRepository } from '@/lib/db/repository/whatsapp-message.repository';
import { connectDB } from '@/lib/mongodb';

/**
 * Campaign Completion Checker Job
 * Checks running campaigns and marks them as completed when all messages are processed
 * Should run every 5 minutes via cron job
 */
export async function checkCampaignCompletion() {
  console.log('[CampaignCompletion] Starting campaign completion checker...');

  try {
    await connectDB();

    // Get all running campaigns
    const runningCampaigns = await whatsappCampaignRepository.find({
      status: 'running',
    });

    console.log(`[CampaignCompletion] Found ${runningCampaigns.length} running campaigns to check`);

    for (const campaign of runningCampaigns) {
      try {
        const campaignId = campaign._id.toString();

        // Get campaign message statistics
        const stats = await whatsappMessageRepository.getCampaignStats(campaignId);

        // Calculate pending messages (scheduled + sending)
        const pendingMessages = stats.total - stats.sent - stats.failed;

        console.log(
          `[CampaignCompletion] Campaign ${campaign.name} (${campaignId}): ${pendingMessages} pending messages`
        );

        // If no pending messages, mark campaign as completed
        if (pendingMessages === 0 && stats.total > 0) {
          await whatsappCampaignRepository.update(campaignId, {
            status: 'completed',
            completedAt: new Date(),
            stats: {
              sent: stats.sent,
              delivered: stats.delivered,
              read: stats.read,
              failed: stats.failed,
            },
          });

          console.log(
            `[CampaignCompletion] Campaign ${campaign.name} marked as completed - ` +
            `Total: ${stats.total}, Sent: ${stats.sent}, Delivered: ${stats.delivered}, ` +
            `Read: ${stats.read}, Failed: ${stats.failed}`
          );
        }
      } catch (error) {
        console.error(
          `[CampaignCompletion] Error checking campaign ${campaign._id}:`,
          error
        );
      }
    }

    console.log('[CampaignCompletion] Finished checking campaign completion');
  } catch (error) {
    console.error('[CampaignCompletion] Job error:', error);
  }
}

/**
 * Campaign Analytics Updater Job
 * Updates campaign metrics even for running campaigns
 * Should run every 10 minutes via cron job
 */
export async function updateCampaignAnalytics() {
  console.log('[CampaignAnalytics] Starting campaign analytics updater...');

  try {
    await connectDB();

    // Get all running and recently completed campaigns (last 7 days)
    const campaigns = await whatsappCampaignRepository.find({
      $or: [
        { status: 'running' },
        {
          status: 'completed',
          completedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      ],
    });

    console.log(`[CampaignAnalytics] Found ${campaigns.length} campaigns to update`);

    for (const campaign of campaigns) {
      try {
        const campaignId = campaign._id.toString();

        // Get current statistics
        const stats = await whatsappMessageRepository.getCampaignStats(campaignId);

        // Update campaign with latest stats
        await whatsappCampaignRepository.update(campaignId, {
          stats: {
            sent: stats.sent,
            delivered: stats.delivered,
            read: stats.read,
            failed: stats.failed,
          },
        });

        console.log(
          `[CampaignAnalytics] Updated analytics for campaign ${campaign.name}: ` +
          `Sent: ${stats.sent}, Delivered: ${stats.delivered}, Read: ${stats.read}, Failed: ${stats.failed}`
        );
      } catch (error) {
        console.error(
          `[CampaignAnalytics] Error updating campaign ${campaign._id}:`,
          error
        );
      }
    }

    console.log('[CampaignAnalytics] Finished updating campaign analytics');
  } catch (error) {
    console.error('[CampaignAnalytics] Job error:', error);
  }
}
