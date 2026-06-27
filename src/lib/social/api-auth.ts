/**
 * Public API key authentication (Epic 6).
 *
 * `authenticateApiKey(request)` reads the `x-api-key` header, hashes it
 * (sha256 — the same scheme used when keys are created), looks the key up by
 * hash, and validates it is not revoked / expired. On success it touches
 * `lastUsedAt` and returns the key's `organizationId` + `scopes`. On any
 * failure it returns `null`.
 *
 * Multi-tenancy hard rule: the resolved `organizationId` comes from the stored
 * key — never from anything the client sends. Public routes scope every query
 * to this value.
 */

import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { socialApiKeyRepository } from '@/lib/db/repository/social-api-key.repository';

export interface ApiKeyAuthResult {
    scopes: string[];
    /** The user who created the key — used as the acting principal for writes. */
    createdByUserId: string;
}

/** Hash a plaintext API key the same way it is stored at creation time. */
export function hashApiKey(plaintext: string): string {
    return crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

export async function authenticateApiKey(
    request: NextRequest | Request,
): Promise<ApiKeyAuthResult | null> {
    try {
        const headerValue = request.headers.get('x-api-key');
        if (!headerValue) return null;

        const presented = headerValue.trim();
        if (!presented) return null;

        const hash = hashApiKey(presented);
        const record = await socialApiKeyRepository.findByHash(hash);
        if (!record) return null;

        if (record.revoked) return null;
        if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) return null;

        // Best-effort usage stamp — must not block auth.
        try {
            await socialApiKeyRepository.touchUsed(record._id.toString());
        } catch {
            /* ignore */
        }

        return {
            scopes: Array.isArray(record.scopes) ? record.scopes : [],
            createdByUserId: record.createdByUserId,
        };
    } catch (err) {
        console.error('[api-auth] authenticateApiKey failed:', err);
        return null;
    }
}
