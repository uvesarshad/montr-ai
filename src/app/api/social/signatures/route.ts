// OSS single-tenant override of src/app/api/social/signatures/route.ts — generated CP-2 hand-patch; org-stripped, userId-scoped.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import { signatureRepository } from '@/lib/db/repository/signature.repository';
import { assertBrandAccess, BrandAccessError, brandAccessErrorResponse } from '@/lib/social/brand-access';

const createSignatureSchema = z.object({
    brandId: z.string().min(1),
    name: z.string().min(1),
    text: z.string().min(1),
    autoAdd: z.boolean().optional(),
});

const updateSignatureSchema = z.object({
    name: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    autoAdd: z.boolean().optional(),
});

/**
 * When a signature is set as the brand default (autoAdd=true), clear autoAdd on
 * every other signature for the same brand so at most one default exists.
 *
 * Single-tenant: the original org-scope arg was the owner discriminator; it is
 * remapped to the owning userId (a brand belongs to exactly one user here, so
 * userId-scoping the sweep is equivalent to the former org-scope while keeping
 * the per-owner invariant intact).
 */
async function clearOtherDefaults(
    userId: string,
    brandId: string,
    keepId: string,
): Promise<void> {
    const siblings = await signatureRepository.listByBrand(brandId);
    await Promise.all(
        siblings
            .filter((s) => s.userId === userId && s._id.toString() !== keepId && s.autoAdd)
            .map((s) => signatureRepository.update(s._id.toString(), { autoAdd: false })),
    );
}

/**
 * GET /api/social/signatures?brandId=...
 * List signatures for a brand.
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const brandId = searchParams.get('brandId');
        if (!brandId) {
            return NextResponse.json({ error: 'brandId required' }, { status: 400 });
        }

        // Tenancy: confirm the brand belongs to the caller (audit C4).
        try {
            await assertBrandAccess(session.user.id, brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        const signatures = await signatureRepository.listByBrand(brandId);
        return NextResponse.json({ signatures });
    } catch (error) {
        console.error('Error fetching signatures:', error);
        return NextResponse.json({ error: 'Failed to fetch signatures' }, { status: 500 });
    }
}

/**
 * POST /api/social/signatures
 * Create a signature. Body: { brandId, name, text, autoAdd }
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const parsed = createSignatureSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'brandId, name and text are required' }, { status: 400 });
        }
        const { brandId, name, text, autoAdd } = parsed.data;

        // Tenancy: confirm the brand belongs to the caller (audit C4).
        try {
            await assertBrandAccess(session.user.id, brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        const signature = await signatureRepository.create({
            brandId,
            userId: session.user.id,
            name,
            text,
            autoAdd: autoAdd ?? false,
        });

        // Enforce at-most-one default per brand.
        if (signature.autoAdd) {
            await clearOtherDefaults(session.user.id, brandId, signature._id.toString());
        }

        return NextResponse.json({ signature }, { status: 201 });
    } catch (error) {
        console.error('Error creating signature:', error);
        return NextResponse.json({ error: 'Failed to create signature' }, { status: 500 });
    }
}

/**
 * PATCH /api/social/signatures?id=...
 * Update a signature (incl. toggling autoAdd).
 */
export async function PATCH(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'id required' }, { status: 400 });
        }

        const parsed = updateSignatureSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid update payload' }, { status: 400 });
        }

        // Tenancy: load the signature and confirm its brand belongs to the caller (audit C4).
        const existing = await signatureRepository.findById(id);
        if (!existing) {
            return NextResponse.json({ error: 'Signature not found' }, { status: 404 });
        }
        try {
            await assertBrandAccess(session.user.id, existing.brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        const signature = await signatureRepository.update(id, parsed.data);
        if (!signature) {
            return NextResponse.json({ error: 'Signature not found' }, { status: 404 });
        }

        // Enforce at-most-one default per brand when this update set the default.
        if (parsed.data.autoAdd === true) {
            await clearOtherDefaults(session.user.id, existing.brandId, id);
        }

        return NextResponse.json({ signature });
    } catch (error) {
        console.error('Error updating signature:', error);
        return NextResponse.json({ error: 'Failed to update signature' }, { status: 500 });
    }
}

/**
 * DELETE /api/social/signatures?id=...
 * Delete a signature.
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'id required' }, { status: 400 });
        }

        // Tenancy: load the signature and confirm its brand belongs to the caller (audit C4).
        const existing = await signatureRepository.findById(id);
        if (!existing) {
            return NextResponse.json({ error: 'Signature not found' }, { status: 404 });
        }
        try {
            await assertBrandAccess(session.user.id, existing.brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        const deleted = await signatureRepository.delete(id);
        if (!deleted) {
            return NextResponse.json({ error: 'Signature not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting signature:', error);
        return NextResponse.json({ error: 'Failed to delete signature' }, { status: 500 });
    }
}
