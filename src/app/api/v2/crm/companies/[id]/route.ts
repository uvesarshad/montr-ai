import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { companyRepository } from '@/lib/db/repository/crm/company.repository';
import { updateCompanySchema } from '@/validations/crm/company.schema';
import { emitCompanyUpdated, emitCompanyDeleted } from '@/lib/crm';
import { auditLogRepository } from '@/lib/db/repository/crm/audit-log.repository';
import { getCrmPermissionContext, assertCrmPermission, ownsRecord, crmErrorResponse, CrmPermissionError } from '@/lib/crm/permissions';
import { z } from 'zod';

/** Compute a shallow change map over the validated payload keys. */
function computeChanges(
  previous: Record<string, unknown>,
  updated: Record<string, unknown>,
  payload: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(payload)) {
    const from = previous?.[key];
    const to = updated?.[key];
    if (String(from) !== String(to)) {
      changes[key] = { from, to };
    }
  }
  return changes;
}

/**
 * GET /api/v2/crm/companies/[id]
 * Get a single company by ID
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
    const ctx = await getCrmPermissionContext(userId);
    const { scope } = assertCrmPermission(ctx, 'company', 'read');

    const company = await companyRepository.findById(params.id);

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    if (scope === 'own' && !ownsRecord(ctx, 'company', company as unknown as Record<string, unknown>)) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    return NextResponse.json(company);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching company:', error);
    return NextResponse.json(
      { error: 'Failed to fetch company', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v2/crm/companies/[id]
 * Update a company
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
    const { scope } = assertCrmPermission(ctx, 'company', 'update');

    const body = await request.json();

    // Validate input
    const validatedData = updateCompanySchema.parse(body);

    // Check if company exists
    const existing = await companyRepository.findById(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    if (scope === 'own' && !ownsRecord(ctx, 'company', existing as unknown as Record<string, unknown>)) {
      throw new CrmPermissionError('No permission to update this company');
    }

    // Check for duplicate domain if being updated
    if (validatedData.domain && validatedData.domain !== existing.domain) {
      const duplicate = await companyRepository.findByDomain(
        validatedData.domain
      );
      if (duplicate && duplicate._id.toString() !== params.id) {
        return NextResponse.json(
          { error: 'Another company with this domain already exists' },
          { status: 400 }
        );
      }
    }

    // Update company
    const company = await companyRepository.update(
      params.id,
      validatedData
    );

    if (!company) {
      return NextResponse.json({ error: 'Failed to update company' }, { status: 500 });
    }

    const changes = computeChanges(
      existing as unknown as Record<string, unknown>,
      company as unknown as Record<string, unknown>,
      validatedData as Record<string, unknown>
    );
    if (Object.keys(changes).length > 0) {
      await emitCompanyUpdated(company, changes, userId);
    }

    return NextResponse.json(company);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error updating company:', error);
    return NextResponse.json(
      { error: 'Failed to update company', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v2/crm/companies/[id]
 * Soft-delete a company (moves to trash). Contacts/deals keep their companyId.
 * `?permanent=true` hard-deletes — admin / super_admin only.
 */
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const role = (session.user as { role?: string }).role;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const ctx = await getCrmPermissionContext(userId);
    const { scope } = assertCrmPermission(ctx, 'company', 'delete');

    const permanent = request.nextUrl.searchParams.get('permanent') === 'true';

    if (permanent && role !== 'admin' && role !== 'super_admin') {
      return NextResponse.json({ error: 'Only admins can permanently delete records' }, { status: 403 });
    }

    // Check if company exists
    const existing = await companyRepository.findById(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    if (scope === 'own' && !ownsRecord(ctx, 'company', existing as unknown as Record<string, unknown>)) {
      throw new CrmPermissionError('No permission to delete this company');
    }

    // Delete company (soft by default, hard when permanent)
    const deleted = permanent
      ? await companyRepository.delete(params.id)
      : await companyRepository.softDelete(params.id, userId);

    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete company' }, { status: 500 });
    }

    await emitCompanyDeleted(existing, userId);
    await auditLogRepository
      .logDelete('company', params.id, existing.name, userId, user.name || '')
      .catch(() => undefined);

    return NextResponse.json({ success: true, message: permanent ? 'Company permanently deleted' : 'Company moved to trash' });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deleting company:', error);
    return NextResponse.json(
      { error: 'Failed to delete company', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
