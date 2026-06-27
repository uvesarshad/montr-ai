import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { updateContactSchema } from '@/validations/crm/contact.schema';
import { emitContactUpdated, emitContactDeleted } from '@/lib/crm';
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
    // Arrays/objects (e.g. emails, phones, address) need a structural compare —
    // String(obj) collapses to "[object Object]" and never registers a change.
    const isComplex =
      (from !== null && typeof from === 'object') || (to !== null && typeof to === 'object');
    const differs = isComplex
      ? JSON.stringify(from) !== JSON.stringify(to)
      : String(from) !== String(to);
    if (differs) {
      changes[key] = { from, to };
    }
  }
  return changes;
}

/**
 * GET /api/v2/crm/contacts/[id]
 * Get a single contact by ID
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
    const { scope } = assertCrmPermission(ctx, 'contact', 'read');

    const contact = await contactRepository.findById(params.id);

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    if (scope === 'own' && !ownsRecord(ctx, 'contact', contact as unknown as Record<string, unknown>)) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json(contact);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching contact:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contact', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v2/crm/contacts/[id]
 * Update a contact
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
    const { scope } = assertCrmPermission(ctx, 'contact', 'update');

    const body = await request.json();

    // Validate input
    const validatedData = updateContactSchema.parse(body);

    // Check if contact exists
    const existing = await contactRepository.findById(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    if (scope === 'own' && !ownsRecord(ctx, 'contact', existing as unknown as Record<string, unknown>)) {
      throw new CrmPermissionError('No permission to update this contact');
    }

    // Check for duplicate email if being updated
    if (validatedData.email && validatedData.email !== existing.email) {
      const duplicate = await contactRepository.findByEmail(
        validatedData.email
      );
      if (duplicate && duplicate._id.toString() !== params.id) {
        return NextResponse.json(
          { error: 'Another contact with this email already exists' },
          { status: 400 }
        );
      }
    }

    // Update contact
    const contact = await contactRepository.update(
      params.id,
      validatedData
    );

    if (!contact) {
      return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
    }

    const changes = computeChanges(
      existing as unknown as Record<string, unknown>,
      contact as unknown as Record<string, unknown>,
      validatedData as Record<string, unknown>
    );
    if (Object.keys(changes).length > 0) {
      await emitContactUpdated(contact, changes, userId);
    }

    return NextResponse.json(contact);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error updating contact:', error);
    return NextResponse.json(
      { error: 'Failed to update contact', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v2/crm/contacts/[id]
 * Soft-delete a contact (moves to trash). `?permanent=true` hard-deletes —
 * admin / super_admin only.
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
    const { scope } = assertCrmPermission(ctx, 'contact', 'delete');

    const permanent = request.nextUrl.searchParams.get('permanent') === 'true';

    if (permanent && role !== 'admin' && role !== 'super_admin') {
      return NextResponse.json({ error: 'Only admins can permanently delete records' }, { status: 403 });
    }

    // Check if contact exists
    const existing = await contactRepository.findById(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    if (scope === 'own' && !ownsRecord(ctx, 'contact', existing as unknown as Record<string, unknown>)) {
      throw new CrmPermissionError('No permission to delete this contact');
    }

    // Delete contact (soft by default, hard when permanent)
    const deleted = permanent
      ? await contactRepository.delete(params.id)
      : await contactRepository.softDelete(params.id, userId);

    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 });
    }

    await emitContactDeleted(existing, userId);
    await auditLogRepository
      .logDelete('contact', params.id, `${existing.firstName} ${existing.lastName ?? ''}`.trim(), userId, user.name || '')
      .catch(() => undefined);

    return NextResponse.json({ success: true, message: permanent ? 'Contact permanently deleted' : 'Contact moved to trash' });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deleting contact:', error);
    return NextResponse.json(
      { error: 'Failed to delete contact', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
