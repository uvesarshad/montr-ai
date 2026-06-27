import { NextResponse } from 'next/server';
import { processScheduledWhatsAppMessages } from '@/lib/jobs/whatsapp-scheduled-messages.job';

/**
 * Cron endpoint for processing scheduled WhatsApp messages
 * Should be called every minute
 *
 * Security: Protected by CRON_SECRET environment variable
 *
 * Usage with external cron service:
 * curl -X POST https://your-domain.com/api/cron/whatsapp/scheduled-messages \
 *   -H "Authorization: Bearer YOUR_CRON_SECRET"
 */
export async function POST(request: Request) {
  try {
    // Verify cron secret. Fail closed if CRON_SECRET is unset so a missing env
    // var cannot accidentally unlock the endpoint with a hard-coded fallback.
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

    // Run the scheduled messages processor
    await processScheduledWhatsAppMessages();

    return NextResponse.json({
      success: true,
      message: 'Scheduled messages processed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Scheduled messages error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process scheduled messages',
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
    job: 'scheduled-messages',
    description: 'Processes scheduled WhatsApp messages',
    schedule: 'Every 1 minute',
  });
}
