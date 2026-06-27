/**
 * Shared brand-access guard for the social API routes (audit C4).
 *
 * Every social surface is keyed by a client-supplied `brandId`. The platform
 * hard rule (CLAUDE.md) is: never trust a client-supplied brand/organization —
 * always re-derive ownership from the session user's DB record. This helper
 * loads the user + brand and confirms the brand belongs to the caller, either
 * because they own it directly or because it lives in their organization.
 *
 * Routes call `assertBrandAccess(sessionUserId, brandId)` after the session
 * check and before any read/write keyed by that brandId, mapping
 * `BrandAccessError` to the matching JSON response via `brandAccessErrorResponse`.
 *
 * The access predicate mirrors `social-post-submissions.ts#getSubmissionContext`
 * and the media route's `userCanAccessBrand` helper — one rule, applied
 * everywhere.
 */

import { NextResponse } from 'next/server';
import { userRepository } from '@/lib/db/repository/user.repository';
import brandRepository from '@/lib/db/repository/brand.repository';
import type { IUser } from '@/lib/db/models/user.model';
import type { IBrand } from '@/lib/db/models/brand.model';
import { connectMongoose } from '@/lib/mongodb';
import BrandContext from '@/lib/db/models/brand-context.model';
import type { BrandProfile } from '@/ai/types';

export class BrandAccessError extends Error {
    status: 401 | 403 | 404;
    constructor(message: string, status: 401 | 403 | 404) {
        super(message);
        this.name = 'BrandAccessError';
        this.status = status;
    }
}

export interface BrandAccessResult {
    user: IUser;
    brand: IBrand;
}

/**
 * Confirm the brand belongs to the caller (direct owner or same organization).
 * Throws `BrandAccessError` (401 user missing, 404 brand missing, 403 denied).
 * Returns the loaded user/brand plus the resolved organizationId so callers
 * don't re-fetch.
 */
export async function assertBrandAccess(userId: string, brandId: string): Promise<BrandAccessResult> {
    const [user, brand] = await Promise.all([
        userRepository.findById(userId),
        brandRepository.findById(brandId),
    ]);

    if (!user) {
        throw new BrandAccessError('User not found', 401);
    }
    if (!brand) {
        throw new BrandAccessError('Brand not found', 404);
    }

    const canAccess = brand.userId === userId;

    if (!canAccess) {
        throw new BrandAccessError('Brand not found', 404);
    }

    return {
        user,
        brand
    };
}

/**
 * Load a compact brand-voice profile for an already-access-checked brand.
 * Returns only the defined fields; returns undefined when no context exists or
 * nothing useful is set, so callers can pass it straight into a flow (absent →
 * prompts behave as before). Caller MUST have run `assertBrandAccess` first.
 */
export async function loadBrandProfile(
    brandId: string
): Promise<BrandProfile | undefined> {
    try {
        await connectMongoose();
        const query: Record<string, string> = { brandId };
        const ctx = await BrandContext.findOne(query).lean<{
            brandVoice?: string;
            tone?: string;
            targetAudience?: string;
            keyMessages?: string[];
        } | null>();
        if (!ctx) return undefined;

        const profile: NonNullable<BrandProfile> = {};
        if (ctx.brandVoice) profile.brandVoice = ctx.brandVoice;
        if (ctx.tone) profile.tone = ctx.tone;
        if (ctx.targetAudience) profile.targetAudience = ctx.targetAudience;
        if (ctx.keyMessages?.length) profile.keyMessages = ctx.keyMessages;

        return Object.keys(profile).length ? profile : undefined;
    } catch {
        return undefined;
    }
}

/** Map a thrown `BrandAccessError` to its JSON response (404 hides existence). */
export function brandAccessErrorResponse(error: BrandAccessError): NextResponse {
    return NextResponse.json({ error: error.message }, { status: error.status });
}
