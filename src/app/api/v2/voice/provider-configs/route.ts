/**
 * User-facing voice provider config API.
 *
 * Mirrors the admin endpoint but locked to `user` scope — each authenticated
 * user can manage their own BYOK credentials. The admin endpoint handles
 * `system`/`org`/`brand` scopes.
 *
 *   GET  /api/v2/voice/provider-configs       — list this user's BYOK creds
 *   POST /api/v2/voice/provider-configs       — create a BYOK cred
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { userRepository } from '@/lib/db/repository/user.repository';
import { voiceProviderConfigRepository } from '@/lib/db/repository/voice';
import { encryptCredential } from '@/lib/workflow/credential-encryption';
import { requireOrgUser } from '@/lib/voice/api-helpers';

const createSchema = z.object({
  providerId: z.enum(['twilio', 'plivo', 'telnyx', 'in-house']),
  displayName: z.string().min(1).max(100),
  credential: z.record(z.string(), z.string()),
  metadata: z.record(z.string(), z.unknown()).optional(),
  pricePerMinuteUsd: z.number().positive().optional(),
});

export async function GET() {
  const authResult = await requireOrgUser();
  if (authResult instanceof NextResponse) return authResult;

  const data = await voiceProviderConfigRepository.listByScope('user', {
    userId: authResult.userId,
  });

  // Strip encrypted fields from the response.
  const sanitized = data.map((doc) => ({
    _id: doc._id,
    providerId: doc.providerId,
    displayName: doc.displayName,
    enabled: doc.enabled,
    metadata: doc.metadata,
    pricePerMinuteUsd: doc.pricePerMinuteUsd,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }));

  return NextResponse.json({ data: sanitized });
}

export async function POST(request: NextRequest) {
  const authResult = await requireOrgUser();
  if (authResult instanceof NextResponse) return authResult;

  // Plan check — does this user's plan allow BYOK for voice? Until V-0.2
  // lands the plan-tier matrix, allow by default. Once `allowVoiceByok` exists
  // on `IPlanFeatures`, gate here.
  // TODO V-0.2: gate BYOK by plan feature `allowVoiceByok`.
  const user = await userRepository.findById(authResult.userId);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 403 });
  }

  try {
    const input = createSchema.parse(await request.json());
    const encrypted = encryptCredential(
      input.displayName,
      'custom',
      input.credential,
      authResult.userId,
      input.metadata,
    );

    const created = await voiceProviderConfigRepository.create({
      scope: 'user',
      providerId: input.providerId,
      userId: authResult.userId,
      ownerUserId: authResult.userId,
      displayName: input.displayName,
      enabled: true,
      encryptedValue: encrypted.encryptedValue,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      salt: encrypted.salt,
      metadata: input.metadata ?? {},
      pricePerMinuteUsd: input.pricePerMinuteUsd,
    });

    return NextResponse.json(
      {
        data: {
          _id: created._id,
          providerId: created.providerId,
          displayName: created.displayName,
          enabled: created.enabled,
          createdAt: created.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: err.errors },
        { status: 400 },
      );
    }
    console.error('user voice provider config create failed:', err);
    return NextResponse.json({ error: 'Create failed' }, { status: 500 });
  }
}
