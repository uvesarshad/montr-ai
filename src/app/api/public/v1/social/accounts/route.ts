/**
 * Public API v1 — connected social accounts (Epic 6).
 *
 * GET /api/public/v1/social/accounts — list connected social accounts across
 * all brands in the key's organization.
 *
 * Authenticated via `x-api-key`. The organization is taken from the resolved
 * key; tokens are NEVER returned.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/social/api-auth';
import brandRepository from '@/lib/db/repository/brand.repository';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';

const READ_SCOPE = 'accounts:read';

function hasScope(scopes: string[], scope: string): boolean {
    return scopes.includes(scope) || scopes.includes('*');
}

export async function GET(request: NextRequest) {
    const authResult = await authenticateApiKey(request);
    if (!authResult) {
        return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
    }
    if (!hasScope(authResult.scopes, READ_SCOPE)) {
        return NextResponse.json(
            { error: 'API key is missing the accounts:read scope', code: 'SCOPE_REQUIRED' },
            { status: 402 },
        );
    }

    try {
        const brands = await brandRepository.findByOrganizationId();

        const accountsNested = await Promise.all(
            brands.map((b) => socialAccountRepository.findByBrandId(b._id.toString())),
        );
        const accounts = accountsNested.flat();

        return NextResponse.json({
            accounts: accounts.map((a) => ({
                id: a._id.toString(),
                brandId: a.brandId,
                platform: a.platform,
                platformUsername: a.platformUsername,
                platformDisplayName: a.platformDisplayName,
                avatarUrl: a.avatarUrl,
                isActive: a.isActive,
                connectionStatus: a.connectionStatus,
            })),
        });
    } catch (error) {
        console.error('[public-api] GET accounts failed:', error);
        return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
    }
}
