/**
 * API key management (dashboard, Epic 6).
 *
 * GET    /api/social/api-keys        — list the org's keys (masked).
 * POST   /api/social/api-keys        — create a key; returns plaintext ONCE.
 * DELETE /api/social/api-keys?id=…   — revoke a key.
 *
 * Session-authenticated and scoped to the session user's organization. The full
 * key (`montrai_<32hex>`) is generated server-side and only its sha256 hash +
 * prefix are persisted — the plaintext is returned a single time at creation.
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import { socialApiKeyRepository } from '@/lib/db/repository/social-api-key.repository';
import { hashApiKey } from '@/lib/social/api-auth';

const createSchema = z.object({
    name: z.string().min(1).max(120),
    scopes: z.array(z.string()).optional(),
    expiresAt: z.string().optional(),
});

function maskKey(prefix: string): string {
    return `${prefix}…`;
}

export async function GET() {
    const session = await getSession();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const organizationId = session.user.id;
    try {
        const keys = await socialApiKeyRepository.listByOrg(organizationId);
        return NextResponse.json({
            keys: keys.map((k) => ({
                id: k._id.toString(),
                name: k.name,
                maskedKey: maskKey(k.keyPrefix),
                scopes: k.scopes,
                lastUsedAt: k.lastUsedAt,
                revoked: k.revoked,
                expiresAt: k.expiresAt,
                createdAt: k.createdAt,
            })),
        });
    } catch (error) {
        console.error('[api-keys] GET failed:', error);
        return NextResponse.json({ error: 'Failed to list API keys' }, { status: 500 });
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
                { error: 'name is required', details: parsed.error.issues },
                { status: 400 },
            );
        }

        const { name, scopes, expiresAt } = parsed.data;

        // Generate the plaintext key: montrai_<32 hex chars (16 random bytes)>.
        const plaintext = `montrai_${crypto.randomBytes(16).toString('hex')}`;
        const keyHash = hashApiKey(plaintext);
        const keyPrefix = plaintext.slice(0, 16); // "montrai_" + 8 hex

        let expires: Date | undefined;
        if (expiresAt) {
            const d = new Date(expiresAt);
            if (!isNaN(d.getTime())) expires = d;
        }

        const record = await socialApiKeyRepository.create({
            createdByUserId: session.user.id,
            name,
            keyPrefix,
            keyHash,
            scopes: scopes && scopes.length ? scopes : ['posts:read', 'posts:write', 'accounts:read'],
            expiresAt: expires,
        });

        return NextResponse.json(
            {
                success: true,
                // Plaintext shown ONCE — never retrievable again.
                key: plaintext,
                apiKey: {
                    id: record._id.toString(),
                    name: record.name,
                    maskedKey: maskKey(record.keyPrefix),
                    scopes: record.scopes,
                    createdAt: record.createdAt,
                },
            },
            { status: 201 },
        );
    } catch (error) {
        console.error('[api-keys] POST failed:', error);
        return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const session = await getSession();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const organizationId = session.user.id;
    try {
        const id = new URL(request.url).searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        // Tenancy: confirm the key belongs to the caller's org before revoking.
        const keys = await socialApiKeyRepository.listByOrg(organizationId);
        const owned = keys.find((k) => k._id.toString() === id);
        if (!owned) {
            return NextResponse.json({ error: 'API key not found' }, { status: 404 });
        }

        await socialApiKeyRepository.revoke(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[api-keys] DELETE failed:', error);
        return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 });
    }
}
