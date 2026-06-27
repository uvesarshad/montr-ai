import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { webhookRepository, CreateWebhookDto } from '@/lib/db/repository/crm/webhook.repository';
import { createWebhookSchema } from '@/validations/crm/webhook.schema';
import { WebhookEvent } from '@/lib/db/models/crm/webhook.model';
import { z } from 'zod';
import { logCreate, getRequestMetadata } from '@/lib/crm/audit';

/**
 * GET /api/v2/crm/webhooks
 * List webhooks with optional filters
 */
export async function GET(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);

    // Parse filters
    const isActive = searchParams.get('isActive');
    const event = searchParams.get('event');

    let webhooks;

    if (event) {
      // Find by specific event
      webhooks = await webhookRepository.findByEvent(event as WebhookEvent);
    } else if (isActive !== null) {
      // Find all with active filter
      webhooks = await webhookRepository.findAll(
        isActive === 'true'
      );
    } else {
      // Find all webhooks
      webhooks = await webhookRepository.findAll(false);
    }

    return NextResponse.json({ webhooks });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching webhooks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch webhooks', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v2/crm/webhooks
 * Create a new webhook
 */
export async function POST(request: NextRequest) {
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
    const body = await request.json();

    // Validate input
    const validatedData = createWebhookSchema.parse(body);

    // Create webhook
    const createData: CreateWebhookDto = {
      name: validatedData.name,
      description: validatedData.description,
      url: validatedData.url,
      method: validatedData.method,
      headers: validatedData.headers,
      secret: validatedData.secret,
      events: validatedData.events,
      filters: validatedData.filters,
      maxRetries: validatedData.maxRetries,
      retryDelaySeconds: validatedData.retryDelaySeconds,
      createdById: userId,
    };
    const webhook = await webhookRepository.create(createData);

    // Webhooks are a security-sensitive surface (they fire on CRM events to
    // arbitrary URLs) — log creates so the trail captures who set them up.
    await logCreate(
      'crm_webhook',
      webhook._id.toString(),
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
    ).catch(err => console.error('[audit] webhook create:', err));

    return NextResponse.json(webhook, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error creating webhook:', error);
    return NextResponse.json(
      { error: 'Failed to create webhook', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
