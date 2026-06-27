import { NextResponse } from 'next/server';
import {
  checkCampaignCompletion,
  updateCampaignAnalytics,
} from '@/lib/jobs/whatsapp-campaign-completion.job';

/**
 * Cron endpoint for checking campaign completion
 * Should be called every 5 minutes
 *
 * Security: Protected by CRON_SECRET environment variable
 *
 * Usage with external cron service:
 * curl -X POST https://your-domain.com/api/cron/whatsapp/campaign-completion \
 *   -H "Authorization: Bearer YOUR_CRON_SECRET"
 */
export async function POST(request: Request) {
  try {
    // Verify cron secret. Fail closed when CRON_SECRET is unset so a missing
    // env var cannot accidentally unlock the endpoint via a hard-coded fallback.
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('[Cron] CRON_SECRET is not configured');
      return NextResponse.json(
        { error: 'Cron endpoint not configured' },
        { status: 503 }
      );
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Run both campaign completion check and analytics update
    await Promise.all([
      checkCampaignCompletion(),
      updateCampaignAnalytics(),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Campaign completion and analytics processed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Campaign completion error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process campaign completion',
        details: (error instanceof Error ? error.message : String(error)),
      },
      { status: 500 }
    );
  }
}

// Allow GET for health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    job: 'campaign-completion',
    description: 'Checks campaign completion and updates analytics',
    schedule: 'Every 5 minutes',
  });
}
