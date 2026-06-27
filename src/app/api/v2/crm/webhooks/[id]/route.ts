import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { webhookRepository } from '@/lib/db/repository/crm/webhook.repository';
import { updateWebhookSchema } from '@/validations/crm/webhook.schema';
import { z } from 'zod';
import { logUpdate, logDelete, getRequestMetadata } from '@/lib/crm/audit';

/**
 * GET /api/v2/crm/webhooks/[id]
 * Get a single webhook by ID
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
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
    const webhook = await webhookRepository.findById(params.id);

    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    return NextResponse.json(webhook);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching webhook:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch webhook', details: message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v2/crm/webhooks/[id]
 * Update a webhook
 */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
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
    const existingWebhook = await webhookRepository.findById(params.id);

    if (!existingWebhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    // Check ownership - only creator can modify
    if (existingWebhook.createdById.toString() !== userId) {
      return NextResponse.json(
        { error: 'Only webhook owner can modify it' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate input
    const validatedData = updateWebhookSchema.parse(body);

    // Update webhook
    const webhook = await webhookRepository.update(
      params.id,
      validatedData
    );

    if (!webhook) {
      return NextResponse.json({ error: 'Failed to update webhook' }, { status: 500 });
    }

    await logUpdate(
      'crm_webhook',
      params.id,
      {
        name: existingWebhook.name,
        url: existingWebhook.url,
        events: existingWebhook.events,
        isActive: existingWebhook.isActive,
      },
      {
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        isActive: webhook.isActive,
      },
      userId,
      user.name || user.email || 'User',
      'ui',
      getRequestMetadata(request),
    ).catch(err => console.error('[audit] webhook update:', err));

    return NextResponse.json(webhook);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error updating webhook:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to update webhook', details: message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v2/crm/webhooks/[id]
 * Delete a webhook
 */
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
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
    const existingWebhook = await webhookRepository.findById(params.id);

    if (!existingWebhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    // Check ownership - only creator can delete
    if (existingWebhook.createdById.toString() !== userId) {
      return NextResponse.json(
        { error: 'Only webhook owner can delete it' },
        { status: 403 }
      );
    }

    // Delete webhook
    const deleted = await webhookRepository.delete(params.id);

    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 });
    }

    await logDelete(
      'crm_webhook',
      params.id,
      {
        name: existingWebhook.name,
        url: existingWebhook.url,
        events: existingWebhook.events,
      },
      userId,
      user.name || user.email || 'User',
      'ui',
      getRequestMetadata(request),
    ).catch(err => console.error('[audit] webhook delete:', err));

    return NextResponse.json({ success: true });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deleting webhook:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to delete webhook', details: message },
      { status: 500 }
    );
  }
}
