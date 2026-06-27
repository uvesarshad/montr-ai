import { NextResponse } from 'next/server';
import { retryWhatsAppMessages } from '@/lib/jobs/whatsapp-retry-messages.job';

/**
 * Cron endpoint for retrying failed WhatsApp messages
 * Should be called every 5 minutes
 *
 * Security: Protected by CRON_SECRET environment variable
 *
 * Usage with external cron service:
 * curl -X POST https://your-domain.com/api/cron/whatsapp/retry-messages \
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

    // Run the retry messages processor
    await retryWhatsAppMessages();

    return NextResponse.json({
      success: true,
      message: 'Failed messages retry processed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Retry messages error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retry messages',
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
    job: 'retry-messages',
    description: 'Retries failed WhatsApp messages',
    schedule: 'Every 5 minutes',
  });
}
