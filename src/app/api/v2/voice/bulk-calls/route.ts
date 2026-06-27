/**
 * Voice bulk calls API (V-8.5).
 *
 *   GET  /api/v2/voice/bulk-calls — list batches.
 *   POST /api/v2/voice/bulk-calls — create a batch and start dispatching.
 *
 * Two input shapes:
 *   - `contactIds: string[]` — look up each contact's phone number from CRM.
 *   - `entries: { phoneNumber, contactId?, variables? }[]` — direct list (CSV upload path).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';

import { requireOrgUser } from '@/lib/voice/api-helpers';
import VoiceBulkBatch from '@/lib/db/models/voice/voice-bulk-batch.model';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { scheduleBulkDispatch } from '@/lib/voice/bulk-dispatcher';
import { enqueueCampaign } from '@/lib/voice/campaign';
import { checkVoiceGate } from '@/lib/voice/plan-gate';
import { createApproval } from '@/lib/approvals';

const e164Regex = /^\+?[1-9]\d{6,14}$/;

const createSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    fromNumber: z.string().regex(e164Regex),
    aiBotId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
    aiCharacterId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
    script: z.string().max(10_000).optional(),
    recordCall: z.boolean().optional(),
    callsPerMinute: z.number().int().min(1).max(60).optional(),
    brandId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
    requiresApproval: z.boolean().optional(),
    contactIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).optional(),
    entries: z
      .array(
        z.object({
          phoneNumber: z.string().regex(e164Regex),
          contactId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
          variables: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .optional(),
  })
  .refine(
    (val) => (val.contactIds && val.contactIds.length > 0) || (val.entries && val.entries.length > 0),
    { message: 'Either contactIds or entries is required' },
  );

export async function GET(request: NextRequest) {
  const auth = await requireOrgUser();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100);
  const brandIdParam = searchParams.get('brandId');

  const query: Record<string, unknown> = {
};
  if (brandIdParam === 'null') {
    query.brandId = null;
  } else if (brandIdParam) {
    query.brandId = new Types.ObjectId(brandIdParam);
  }

  const data = await VoiceBulkBatch.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    // Strip entries from the list view — they can be large.
    .select('-entries')
    .exec();

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const auth = await requireOrgUser();
  if (auth instanceof NextResponse) return auth;

  let input: z.infer<typeof createSchema>;
  try {
    input = createSchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: err.errors },
        { status: 400 },
      );
    }
    throw err;
  }

  // Plan gate before persisting anything.
  const gate = await checkVoiceGate({
    userId: auth.userId,
    isByok: false, // bulk dialer uses org/system credentials
  });
  if (!gate.allowed) {
    return NextResponse.json(
      { error: 'Voice not allowed', message: gate.reason },
      { status: 403 },
    );
  }

  // Materialize entries from contactIds + direct entries.
  const entries: Array<{ contactId?: string; phoneNumber: string; variables?: Record<string, unknown> }> = [];
  if (input.contactIds) {
    for (const cid of input.contactIds) {
      const contact = await contactRepository.findById(cid);
      if (!contact) continue;
      const phone =
        contact.phone
        ?? contact.channels?.find((c) => c.type === 'phone')?.identifier;
      if (!phone || !e164Regex.test(phone)) continue;
      entries.push({
        contactId: cid,
        phoneNumber: phone,
        variables: {
          firstName: contact.firstName,
          lastName: contact.lastName,
        },
      });
    }
  }
  if (input.entries) {
    for (const e of input.entries) {
      entries.push({ contactId: e.contactId, phoneNumber: e.phoneNumber, variables: e.variables });
    }
  }

  if (entries.length === 0) {
    return NextResponse.json(
      { error: 'No valid entries — contacts must have E.164 phone numbers' },
      { status: 400 },
    );
  }

  const requiresApproval = input.requiresApproval === true;

  const batch = await VoiceBulkBatch.create({
    brandId: input.brandId ? new Types.ObjectId(input.brandId) : null,
    createdById: new Types.ObjectId(auth.userId),
    name: input.name,
    description: input.description,
    fromNumber: input.fromNumber,
    aiBotId: input.aiBotId,
    aiCharacterId: input.aiCharacterId,
    script: input.script,
    recordCall: input.recordCall ?? false,
    callsPerMinute: input.callsPerMinute ?? 10,
    status: requiresApproval ? 'pending_approval' : 'pending',
    entries: entries.map((e) => ({
      contactId: e.contactId ? new Types.ObjectId(e.contactId) : null,
      phoneNumber: e.phoneNumber,
      variables: e.variables,
      status: 'pending',
    })),
    totals: {
      total: entries.length,
      pending: entries.length,
      placing: 0,
      inProgress: 0,
      completed: 0,
      failed: 0,
      noAnswer: 0,
      voicemail: 0,
    },
  });

  if (requiresApproval) {
    try {
      const approval = await createApproval({
        brandId: input.brandId,
        subjectKind: 'voice-script',
        subjectId: batch._id?.toString() ?? '',
        subjectSummary: {
          name: input.name,
          entryCount: entries.length,
          fromNumber: input.fromNumber,
          callsPerMinute: input.callsPerMinute ?? 10,
          scriptPreview: input.script?.slice(0, 200),
        },
        submittedBy: auth.userId,
      });
      await VoiceBulkBatch.updateOne(
        { _id: batch._id },
        { $set: { approvalId: approval._id } },
      );
    } catch (err) {
      console.error('[bulk-calls] approval create failed:', err);
    }
  } else {
    // Durable campaign engine (BullMQ + Redis rate-limit + circuit-breaker).
    // Falls back to the legacy in-memory setTimeout dispatcher when Redis is
    // not configured (dev), so the batch still dials.
    const batchId = batch._id?.toString() ?? '';
    const enqueued = await enqueueCampaign(batchId, auth.userId);
    if (!enqueued) {
      scheduleBulkDispatch(batchId);
    }
  }

  return NextResponse.json(
    {
      data: {
        _id: batch._id,
        name: batch.name,
        status: batch.status,
        totals: batch.totals,
      },
    },
    { status: 201 },
  );
}
