import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { contactRepository, type UpdateContactDto } from '@/lib/db/repository/crm/contact.repository';
import { mergeContactSchema } from '@/validations/crm/contact.schema';
import { z } from 'zod';

/**
 * POST /api/v2/crm/contacts/[id]/merge
 * Merge duplicate contacts
 * The contact at [id] is the target, sourceId is merged into it
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    const ctx = await getCrmPermissionContext(userId);
    assertCrmPermission(ctx, 'contact', 'update');
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const targetId = params.id;
    const body = await request.json();

    // Validate input
    const validatedData = mergeContactSchema.parse({
      targetId,
      ...body,
    });

    const { sourceId, fieldPreferences = {} } = validatedData;

    // Fetch both contacts
    const [source, target] = await Promise.all([
      contactRepository.findById(sourceId),
      contactRepository.findById(targetId),
    ]);

    if (!source) {
      return NextResponse.json({ error: 'Source contact not found' }, { status: 404 });
    }

    if (!target) {
      return NextResponse.json({ error: 'Target contact not found' }, { status: 404 });
    }

    // Merge fields based on preferences
    const mergedData: Record<string, unknown> = {};

    // For each field, use fieldPreferences or default to target
    const mergeableFields = [
      'firstName',
      'lastName',
      'email',
      'phone',
      'avatar',
      'jobTitle',
      'department',
      'companyId',
      'address',
      'source',
      'sourceDetails',
      'status',
      'lifecycle',
      'rating',
      'score',
      'socialProfiles',
      'marketingConsent',
      'doNotContact',
    ];

    mergeableFields.forEach((field) => {
      const preference = fieldPreferences[field] || 'target';
      const sourceValue = (source as unknown as Record<string, unknown>)[field];
      const targetValue = (target as unknown as Record<string, unknown>)[field];

      if (preference === 'source' && sourceValue !== undefined && sourceValue !== null) {
        mergedData[field] = sourceValue;
      } else if (targetValue === undefined || targetValue === null) {
        // If target is empty, use source
        if (sourceValue !== undefined && sourceValue !== null) {
          mergedData[field] = sourceValue;
        }
      }
    });

    // Merge tags (union)
    const mergedTags = Array.from(
      new Set([
        ...target.tags.map((t) => t.toString()),
        ...source.tags.map((t) => t.toString()),
      ])
    );
    mergedData.tags = mergedTags;

    // Merge custom fields
    mergedData.customFields = {
      ...source.customFields,
      ...target.customFields,
    };

    // Merge channels (avoid duplicates)
    const existingChannels = new Set(
      target.channels.map((c) => `${c.type}:${c.identifier}`)
    );
    const newChannels = source.channels.filter(
      (c) => !existingChannels.has(`${c.type}:${c.identifier}`)
    );
    if (newChannels.length > 0) {
      mergedData.channels = [...target.channels, ...newChannels];
    }

    // Update engagement metrics (take the max or sum)
    if (source.lastActivityAt && (!target.lastActivityAt || source.lastActivityAt > target.lastActivityAt)) {
      mergedData.lastActivityAt = source.lastActivityAt;
    }
    if (source.lastContactedAt && (!target.lastContactedAt || source.lastContactedAt > target.lastContactedAt)) {
      mergedData.lastContactedAt = source.lastContactedAt;
    }
    if (source.lastEmailAt && (!target.lastEmailAt || source.lastEmailAt > target.lastEmailAt)) {
      mergedData.lastEmailAt = source.lastEmailAt;
    }
    mergedData.totalActivities = (target.totalActivities || 0) + (source.totalActivities || 0);
    mergedData.totalEmails = (target.totalEmails || 0) + (source.totalEmails || 0);

    // Update target contact
    const updatedContact = await contactRepository.update(targetId, mergedData as unknown as UpdateContactDto);

    if (!updatedContact) {
      return NextResponse.json({ error: 'Failed to merge contacts' }, { status: 500 });
    }

    // TODO: Update all related records (activities, deals, emails) to point to target
    // This would require activity, deal, and email repositories

    // Delete source contact
    await contactRepository.delete(sourceId);

    return NextResponse.json({
      success: true,
      contact: updatedContact,
      message: 'Contacts merged successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error merging contacts:', error);
    return NextResponse.json(
      { error: 'Failed to merge contacts', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
