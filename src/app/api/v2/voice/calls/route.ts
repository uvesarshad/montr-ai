/**
 * Voice calls API.
 *
 *   GET  /api/v2/voice/calls — list call sessions for the user's org.
 *   POST /api/v2/voice/calls — initiate an outbound call.
 *
 * Outbound flow:
 *   1. Resolve provider + credential via `getProviderForCall`.
 *   2. Create a `CallSession` row in `queued` state (no providerCallId yet).
 *   3. Call `provider.initiateOutboundCall` with the session id so webhook
 *      callbacks can correlate.
 *   4. Patch the session with the returned `providerCallId` and `status`.
 *
 * Returns `callSessionId` so the client can subscribe to `voice:call:[id]` on
 * Socket.io.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import {
  callSessionRepository,
  voicePhoneNumberRepository,
} from '@/lib/db/repository/voice';
import { initVoiceSubsystem } from '@/lib/voice/bootstrap';
import { getProviderForCall } from '@/lib/voice';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { initiateCallSchema } from '@/validations/voice/call.schema';
import { checkVoiceGate } from '@/lib/voice/plan-gate';

initVoiceSubsystem();

function getBaseUrl(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (fromEnv) return fromEnv;
  // Fall back to the request's own origin (dev convenience).
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await userRepository.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'No organization' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page') ?? '1');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '25'), 100);
    const direction = searchParams.get('direction') as 'inbound' | 'outbound' | null;
    const contactId = searchParams.get('contactId') ?? undefined;
    const phoneNumber = searchParams.get('phoneNumber') ?? undefined;
    const brandId = searchParams.get('brandId');
    const workflowRunId = searchParams.get('workflowRunId') ?? undefined;

    const { data, total } = await callSessionRepository.list(
      {
        direction: direction ?? undefined,
        contactId,
        phoneNumber,
        brandId: brandId ?? undefined,
        workflowRunId,
      },
      { page, limit },
    );

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    console.error('Error listing voice calls:', error);
    return NextResponse.json(
      { error: 'Failed to list calls' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await userRepository.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'No organization' }, { status: 403 });
    }
    const body = await request.json();
    const input = initiateCallSchema.parse(body);

    const selection = await getProviderForCall({
      userId: session.user.id,
      brandId: input.brandId,
    });
    if (!selection) {
      return NextResponse.json(
        {
          error: 'No voice provider available',
          message:
            'Configure a voice provider in admin settings or add a BYOK credential.',
        },
        { status: 402 },
      );
    }

    // Plan-tier gate (Q1, 2026-05-22). BYOK bypasses minute caps.
    const gate = await checkVoiceGate({
      userId: session.user.id,
      isByok: selection.source === 'byok',
      providerId: selection.provider.id,
    });
    if (!gate.allowed) {
      return NextResponse.json(
        {
          error: 'Voice not allowed',
          message: gate.reason,
          minutesUsed: gate.minutesUsed,
          minutesLimit: gate.minutesLimit,
          upgradeRequired: true,
        },
        { status: 403 },
      );
    }

    // Resolve from-number: caller-supplied OR a default owned by org/brand.
    let fromNumber = input.from;
    if (!fromNumber) {
      const owned = await voicePhoneNumberRepository.list({
        brandId: input.brandId ?? null,
        providerId: selection.provider.id,
        status: 'active',
      });
      if (owned.length === 0) {
        return NextResponse.json(
          {
            error: 'No caller ID available',
            message:
              'Provision a phone number first, or supply `from` in the request.',
          },
          { status: 400 },
        );
      }
      fromNumber = owned[0].phoneNumber;
    }

    // Best-effort contact resolution for the *to* side (B3 not running yet).
    let toContactId: string | undefined;
    if (input.fromContactId) {
      const contact = await contactRepository.findById(
        input.fromContactId
      );
      if (contact?.phone === input.to) {
        toContactId = contact._id?.toString();
      }
    }

    const callSession = await callSessionRepository.create({
      brandId: input.brandId ?? null,
      providerId: selection.provider.id,
      providerConfigId:
        typeof selection.credential.metadata?.configId === 'string'
          ? selection.credential.metadata.configId
          : undefined,
      direction: 'outbound',
      fromNumber,
      toNumber: input.to,
      fromContactId: input.fromContactId,
      toContactId,
      initiatorType: input.workflowRunId ? 'workflow' : 'user',
      initiatorId: input.workflowRunId ?? session.user.id,
      workflowRunId: input.workflowRunId,
      status: 'queued',
      customMetadata: {
        ...(input.aiBotId ? { aiBotId: input.aiBotId } : {}),
        ...(input.aiCharacterId ? { aiCharacterId: input.aiCharacterId } : {}),
      },
    });

    const callSessionId = callSession._id?.toString();
    if (!callSessionId) {
      throw new Error('Failed to persist call session');
    }

    try {
      const result = await selection.provider.initiateOutboundCall(
        {
          from: fromNumber,
          to: input.to,
          callSessionId,
          webhookBaseUrl: getBaseUrl(request),
          options: input.options,
        },
        selection.credential,
      );

      await callSessionRepository.updateProviderCallId(
        callSessionId,
        result.providerCallId,
      );
      await callSessionRepository.updateStatus(callSessionId, {
        // status field comes back from the provider — store it after
        // we've stamped providerCallId.
      });

      return NextResponse.json(
        {
          callSessionId,
          providerCallId: result.providerCallId,
          status: result.status,
          providerId: selection.provider.id,
          source: selection.source,
        },
        { status: 201 },
      );
    } catch (providerError) {
      const message =
        providerError instanceof Error
          ? providerError.message
          : 'Provider error';
      await callSessionRepository.updateStatus(callSessionId, {
        status: 'failed',
        endReason: 'error',
        errorMessage: message,
        endedAt: new Date(),
      });
      console.error('Provider initiate failed:', providerError);
      return NextResponse.json(
        { error: 'Failed to initiate call', message, callSessionId },
        { status: 502 },
      );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 },
      );
    }
    console.error('Error initiating voice call:', error);
    return NextResponse.json(
      { error: 'Failed to initiate call' },
      { status: 500 },
    );
  }
}
