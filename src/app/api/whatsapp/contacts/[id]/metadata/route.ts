import { NextResponse } from 'next/server';
import { z } from 'zod';
import CrmContact from '@/lib/db/models/crm/contact.model';
import { getWhatsAppContext, requirePermissionOrFail, WhatsAppApiErrors } from '@/lib/whatsapp/api-middleware';

/**
 * Update WhatsApp contact metadata
 * PATCH /api/whatsapp/contacts/[id]/metadata
 *
 * Permissions:
 * - Admin: Can update any contact
 * - Agent: Can update contacts they interact with
 *
 * Body:
 * - language?: string - Contact's preferred language code
 * - subscriptionStatus?: 'subscribed' | 'unsubscribed' - Marketing opt-in status
 * - doNotContact?: boolean - Do not contact flag
 * - tags?: string[] - Contact tags
 */

const updateMetadataSchema = z.object({
  language: z.string().optional(),
  subscriptionStatus: z.enum(['subscribed', 'unsubscribed']).optional(),
  doNotContact: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Authenticate and get context
  const context = await getWhatsAppContext();
  if (context instanceof NextResponse) return context;

  // Check permission
  const permissionError = requirePermissionOrFail(context, 'canEditContacts');
  if (permissionError) return permissionError;

  try {
    const body = await request.json();
    const validation = updateMetadataSchema.safeParse(body);

    if (!validation.success) {
      return WhatsAppApiErrors.badRequest(validation.error.errors[0].message);
    }

    const { language, subscriptionStatus, doNotContact, tags } = validation.data;

    // Find contact
    const contact = await CrmContact.findOne({
      _id: params.id
    });

    if (!contact) {
      return WhatsAppApiErrors.notFound('Contact');
    }

    // Update metadata
    const updates: Record<string, unknown> = {};

    if (language !== undefined) {
      // Store language in custom fields
      updates['customFields.whatsapp_language'] = language;
    }

    if (subscriptionStatus !== undefined) {
      updates.marketingConsent = subscriptionStatus === 'subscribed';
      if (subscriptionStatus === 'subscribed') {
        updates.consentTimestamp = new Date();
      }
    }

    if (doNotContact !== undefined) {
      updates.doNotContact = doNotContact;
    }

    if (tags !== undefined) {
      // For simplicity, we'll replace tags array
      // In production, you might want to merge or handle differently
      updates.tags = tags;
    }

    // Apply updates
    const updatedContact = await CrmContact.findByIdAndUpdate(
      params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    return NextResponse.json({
      message: 'Contact metadata updated successfully',
      data: updatedContact,
    });
  } catch (error) {
    console.error('Error updating contact metadata:', error);
    return WhatsAppApiErrors.serverError((error instanceof Error ? error.message : String(error)));
  }
}

/**
 * Get WhatsApp contact metadata
 * GET /api/whatsapp/contacts/[id]/metadata
 */
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Authenticate and get context
  const context = await getWhatsAppContext();
  if (context instanceof NextResponse) return context;

  try {
    // Find contact
    const contact = await CrmContact.findOne({
      _id: params.id
    });

    if (!contact) {
      return WhatsAppApiErrors.notFound('Contact');
    }

    // Extract WhatsApp metadata
    const metadata = {
      language: contact.customFields?.whatsapp_language || null,
      subscriptionStatus: contact.marketingConsent ? 'subscribed' : 'unsubscribed',
      doNotContact: contact.doNotContact,
      tags: contact.tags,
      whatsappChannel: contact.channels.find((ch) => ch.type === 'whatsapp'),
      lastContactedAt: contact.lastContactedAt,
    };

    return NextResponse.json({
      data: metadata,
    });
  } catch (error) {
    console.error('Error fetching contact metadata:', error);
    return WhatsAppApiErrors.serverError((error instanceof Error ? error.message : String(error)));
  }
}
