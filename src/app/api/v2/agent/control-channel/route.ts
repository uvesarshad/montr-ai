/**
 * Agent WhatsApp control channel — pairing API (G12, 2026-06-05).
 *
 * GET    → current binding status for the session user
 * POST   → start pairing { phone, brandId? } → { code, whatsappNumber, expiresAt }
 *          (the code is shown in the UI; the user texts "PAIR <code>" to the
 *          brand's WhatsApp number — activation happens in the webhook)
 * DELETE → revoke the binding
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { startPairing, getBindingForUser, revokeBinding } from '@/lib/agent/control-channel';

async function resolveSessionOrg(): Promise<{ userId: string; } | NextResponse> {
    const session = await getSession();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    return { userId };
}

export async function GET() {
    try {
        const ctx = await resolveSessionOrg();
        if (ctx instanceof NextResponse) return ctx;

        const binding = await getBindingForUser(ctx.userId);
        if (!binding) return NextResponse.json({ binding: null });

        return NextResponse.json({
            binding: {
                status: binding.status,
                phone: binding.phone,
                pairedAt: binding.pairedAt?.toISOString() ?? null,
                pairingExpiresAt: binding.pairingExpiresAt?.toISOString() ?? null,
                lastUsedAt: binding.lastUsedAt?.toISOString() ?? null,
            },
        });
    } catch (error) {
        console.error('[ControlChannel API] GET failed:', error);
        return NextResponse.json({ error: 'Failed to load control channel status' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const ctx = await resolveSessionOrg();
        if (ctx instanceof NextResponse) return ctx;

        const body = await req.json().catch(() => ({}));
        const phone = typeof body.phone === 'string' ? body.phone : '';
        const brandId = typeof body.brandId === 'string' && body.brandId ? body.brandId : null;

        if (!phone) {
            return NextResponse.json({ error: 'phone is required' }, { status: 400 });
        }

        const result = await startPairing({
            userId: ctx.userId,
            brandId,
            phone,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({
            code: result.code,
            whatsappNumber: result.whatsappNumber,
            expiresAt: result.expiresAt,
        });
    } catch (error) {
        console.error('[ControlChannel API] POST failed:', error);
        return NextResponse.json({ error: 'Failed to start pairing' }, { status: 500 });
    }
}

export async function DELETE() {
    try {
        const ctx = await resolveSessionOrg();
        if (ctx instanceof NextResponse) return ctx;

        const revoked = await revokeBinding(ctx.userId);
        return NextResponse.json({ revoked });
    } catch (error) {
        console.error('[ControlChannel API] DELETE failed:', error);
        return NextResponse.json({ error: 'Failed to revoke binding' }, { status: 500 });
    }
}
