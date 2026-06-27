import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { webhookRepository } from '@/lib/db/repository/crm/webhook.repository';
import { deliverWebhook, buildWebhookPayload } from '@/lib/crm/webhook-delivery';
import { testWebhookSchema } from '@/validations/crm/webhook.schema';
import { z } from 'zod';

/**
 * POST /api/v2/crm/webhooks/[id]/test
 * Test a webhook by sending a sample payload
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const ctx = await getCrmPermissionContext(userId);
    assertCanManageSettings(ctx);

    // Check if webhook exists and user has access
    const webhook = await webhookRepository.findById(params.id);

    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    // Check ownership - only creator can test
    if (webhook.createdById.toString() !== userId) {
      return NextResponse.json(
        { error: 'Only webhook owner can test it' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = testWebhookSchema.parse(body);

    // Build test payload
    const testPayload = validatedData.payload || {
      _id: 'test-id',
      name: 'Test Record',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
    };

    const payload = buildWebhookPayload(
      validatedData.event,
      testPayload,
      { test: true, triggeredBy: userId }
    );

    // Deliver webhook
    await deliverWebhook(webhook, validatedData.event, payload, 1);

    return NextResponse.json({
      success: true,
      message: 'Test webhook sent successfully',
      details: {
        url: webhook.url,
        method: webhook.method,
        event: validatedData.event,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error testing webhook:', error);
    return NextResponse.json(
      { error: 'Failed to test webhook', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
