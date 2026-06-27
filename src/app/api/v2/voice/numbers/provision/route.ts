/**
 * Provision a new phone number from the selected provider.
 *
 * Twilio: searches available numbers matching the input (country, area code),
 * purchases the first available, and stores a `VoicePhoneNumber` row.
 *
 * Non-Twilio providers: not yet implemented — return 501 until the provider
 * file lands.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import twilio from 'twilio';

import { decryptCredential } from '@/lib/workflow/credential-encryption';
import {
  voicePhoneNumberRepository,
  voiceProviderConfigRepository,
} from '@/lib/db/repository/voice';
import { initVoiceSubsystem } from '@/lib/voice/bootstrap';
import { getProviderForCall } from '@/lib/voice';
import { requireOrgUser } from '@/lib/voice/api-helpers';
import { provisionNumberSchema } from '@/validations/voice/phone-number.schema';

initVoiceSubsystem();

interface TwilioCred {
  accountSid: string;
  authToken: string;
}

function decryptTwilio(
  credential: Awaited<ReturnType<typeof voiceProviderConfigRepository.findById>>,
): TwilioCred {
  if (!credential) {
    throw new Error('Credential not found');
  }
  const decrypted = decryptCredential(
    {
      name: credential.displayName,
      type: 'custom',
      encryptedValue: credential.encryptedValue,
      iv: credential.iv,
      authTag: credential.authTag,
      salt: credential.salt,
    },
    credential.ownerUserId.toString(),
  );
  const value = decrypted.value as Partial<TwilioCred>;
  if (typeof value?.accountSid !== 'string' || typeof value?.authToken !== 'string') {
    throw new Error('Credential did not decrypt to {accountSid, authToken}');
  }
  return value as TwilioCred;
}

export async function POST(request: NextRequest) {
  const authResult = await requireOrgUser();
  if (authResult instanceof NextResponse) return authResult;

  let input: z.infer<typeof provisionNumberSchema>;
  try {
    input = provisionNumberSchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: err.errors },
        { status: 400 },
      );
    }
    throw err;
  }

  if (input.providerId !== 'twilio') {
    return NextResponse.json(
      { error: `Provisioning not implemented for provider "${input.providerId}"` },
      { status: 501 },
    );
  }

  const selection = await getProviderForCall({
    userId: authResult.userId,
    brandId: input.brandId ?? null,
    preferredProviderId: input.providerId,
  });
  if (!selection) {
    return NextResponse.json(
      { error: 'No Twilio credential available for this org' },
      { status: 402 },
    );
  }

  let configDoc: Awaited<ReturnType<typeof voiceProviderConfigRepository.findById>> = null;
  const configId = selection.credential.metadata?.configId;
  if (typeof configId === 'string') {
    configDoc = await voiceProviderConfigRepository.findById(configId);
  }
  if (!configDoc) {
    return NextResponse.json(
      { error: 'Provider config not found' },
      { status: 500 },
    );
  }

  let cred: TwilioCred;
  try {
    cred = decryptTwilio(configDoc);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Credential decode failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const client = twilio(cred.accountSid, cred.authToken);

  try {
    let pickedNumber = input.phoneNumber;
    if (!pickedNumber) {
      const available = await client
        .availablePhoneNumbers(input.countryCode)
        .local.list({ areaCode: input.areaCode ? Number(input.areaCode) : undefined, limit: 5 });
      if (available.length === 0) {
        return NextResponse.json(
          { error: 'No numbers available matching the filter' },
          { status: 404 },
        );
      }
      pickedNumber = available[0].phoneNumber;
    }

    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: pickedNumber,
      friendlyName: input.friendlyName,
    });

    const stored = await voicePhoneNumberRepository.create({
      brandId: input.brandId ?? null,
      providerId: 'twilio',
      providerNumberId: purchased.sid,
      phoneNumber: purchased.phoneNumber,
      friendlyName: input.friendlyName ?? purchased.friendlyName,
      countryCode: input.countryCode,
      capabilities: input.capabilities ?? ['voice'],
      inboundRouting: input.inboundRouting ?? { type: 'disabled' },
      createdById: authResult.userId,
    });

    // Now that we have a Mongo `_id` for the number, wire Twilio's voiceUrl to
    // our inbound answer endpoint. Best-effort: if this fails we keep the row
    // and surface a warning — the admin can hit a "re-sync routing" endpoint
    // later. The base URL must be HTTPS for Twilio to accept it.
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL
      ?? process.env.NEXTAUTH_URL
      ?? new URL(request.url).origin;
    const voiceUrl = `${baseUrl}/api/v2/voice/webhooks/twilio/inbound/${stored._id?.toString()}`;
    const statusCallback = `${baseUrl}/api/v2/voice/webhooks/twilio/status/${stored._id?.toString()}`;
    let voiceUrlWarning: string | undefined;
    try {
      await client.incomingPhoneNumbers(purchased.sid).update({
        voiceUrl,
        voiceMethod: 'POST',
        statusCallback,
        statusCallbackMethod: 'POST',
      });
    } catch (err) {
      voiceUrlWarning =
        err instanceof Error ? err.message : 'Failed to set voiceUrl on Twilio';
      console.warn('[voice-provision] voiceUrl update failed:', voiceUrlWarning);
    }

    return NextResponse.json(
      { data: stored, ...(voiceUrlWarning ? { voiceUrlWarning } : {}) },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Provider error';
    console.error('Provisioning failed:', err);
    return NextResponse.json(
      { error: 'Failed to provision number', message },
      { status: 502 },
    );
  }
}
