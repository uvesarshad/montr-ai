/**
 * Webhook subscription management (dashboard, Epic 6).
 *
 * GET    /api/social/webhook-subscriptions        — list the org's subscriptions.
 * POST   /api/social/webhook-subscriptions        — create a subscription.
 * PATCH  /api/social/webhook-subscriptions         — update one (id in body).
 * DELETE /api/social/webhook-subscriptions?id=…    — delete one.
 *
 * Session-authenticated and scoped to the session user's organization. The
 * delivery URL is SSRF-validated at create/update time so subscriptions can't be
 * pointed at internal hosts. A signing secret is generated server-side when not
 * supplied.
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import { webhookSubscriptionRepository } from '@/lib/db/repository/webhook-subscription.repository';
import { assertSafeOutboundUrl } from '@/lib/workflow/ssrf-guard';

const EVENT_VALUES = ['post.published', 'post.failed', 'post.approved', 'post.scheduled'] as const;

const createSchema = z.object({
    name: z.string().min(1).max(120),
    url: z.string().url(),
    events: z.array(z.string()).min(1),
    brandId: z.string().optional(),
    secret: z.string().optional(),
    active: z.boolean().optional(),
});

const updateSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(120).optional(),
    url: z.string().url().optional(),
    events: z.array(z.string()).min(1).optional(),
    secret: z.string().optional(),
    active: z.boolean().optional(),
});

function serialize(sub: {
    _id: { toString(): string };
    name: string;
    url: string;
    events: string[];
    brandId?: string | null;
    active: boolean;
    lastDeliveryAt?: Date | null;
    lastDeliveryStatus?: number | null;
    failureCount: number;
    createdAt: Date;
}) {
    return {
        id: sub._id.toString(),
        name: sub.name,
        url: sub.url,
        events: sub.events,
        brandId: sub.brandId ?? null,
        active: sub.active,
        lastDeliveryAt: sub.lastDeliveryAt ?? null,
        lastDeliveryStatus: sub.lastDeliveryStatus ?? null,
        failureCount: sub.failureCount,
        createdAt: sub.createdAt,
    };
}

export async function GET() {
    const session = await getSession();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const subs = await webhookSubscriptionRepository.listByOrg();
        return NextResponse.json({
            subscriptions: subs.map(serialize),
            availableEvents: EVENT_VALUES,
        });
    } catch (error) {
        console.error('[webhook-subscriptions] GET failed:', error);
        return NextResponse.json({ error: 'Failed to list subscriptions' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const session = await getSession();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const parsed = createSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request body', details: parsed.error.issues },
                { status: 400 },
            );
        }
        const body = parsed.data;

        // SSRF: reject internal / blocked delivery targets at registration time.
        try {
            await assertSafeOutboundUrl(body.url);
        } catch {
            return NextResponse.json(
                { error: 'Webhook URL is not allowed (must be a public http(s) endpoint).' },
                { status: 400 },
            );
        }

        const secret = body.secret && body.secret.length >= 8
            ? body.secret
            : crypto.randomBytes(24).toString('hex');

        const sub = await webhookSubscriptionRepository.create({
            brandId: body.brandId,
            createdByUserId: session.user.id,
            name: body.name,
            url: body.url,
            secret,
            events: body.events,
            active: body.active ?? true,
        });

        return NextResponse.json(
            {
                success: true,
                subscription: serialize(sub),
                // Secret shown once so the receiver can be configured to verify.
                secret,
            },
            { status: 201 },
        );
    } catch (error) {
        console.error('[webhook-subscriptions] POST failed:', error);
        return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    const session = await getSession();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const parsed = updateSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request body', details: parsed.error.issues },
                { status: 400 },
            );
        }
        const { id, ...updates } = parsed.data;

        // Tenancy: the subscription must belong to the caller's org.
        const existing = await webhookSubscriptionRepository.findById(id);
        if (!existing) {
            return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
        }

        if (updates.url) {
            try {
                await assertSafeOutboundUrl(updates.url);
            } catch {
                return NextResponse.json(
                    { error: 'Webhook URL is not allowed (must be a public http(s) endpoint).' },
                    { status: 400 },
                );
            }
        }

        const updated = await webhookSubscriptionRepository.update(id, updates);
        return NextResponse.json({
            success: true,
            subscription: updated ? serialize(updated) : null,
        });
    } catch (error) {
        console.error('[webhook-subscriptions] PATCH failed:', error);
        return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const session = await getSession();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const id = new URL(request.url).searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        // Tenancy: confirm ownership before deleting.
        const existing = await webhookSubscriptionRepository.findById(id);
        if (!existing) {
            return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
        }

        const deleted = await webhookSubscriptionRepository.delete(id);
        return NextResponse.json({ success: true, deleted });
    } catch (error) {
        console.error('[webhook-subscriptions] DELETE failed:', error);
        return NextResponse.json({ error: 'Failed to delete subscription' }, { status: 500 });
    }
}
