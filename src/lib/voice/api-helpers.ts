/**
 * Shared helpers for voice API routes.
 *
 * - `requireOrgUser` — auth + org guard. Returns `{ userId, organizationId }`
 *   or a NextResponse error.
 * - `resolveProviderForSession` — loads a call session, finds the provider +
 *   credential used by it. Reuses the same selection chain to honor BYOK and
 *   org overrides.
 */

import { NextResponse } from 'next/server';

import { getSession } from '@/lib/get-session';
import { callSessionRepository } from '@/lib/db/repository/voice';
import { initVoiceSubsystem } from './bootstrap';
import { getProviderForCall } from './selection';
import type { ICallSession } from '@/lib/db/models/voice/call-session.model';
import type { VoiceProviderSelection } from './selection';

initVoiceSubsystem();

export interface AuthedRequest {
  userId: string;
}

export async function requireOrgUser(): Promise<AuthedRequest | NextResponse> {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return {
    userId: session.user.id
  };
}

export async function loadCallSessionOrFail(
  id: string
): Promise<ICallSession | NextResponse> {
  const session = await callSessionRepository.findById(id);
  if (!session) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 });
  }
  return session;
}

/**
 * Resolve the provider + credential that's controlling a given call session.
 * The selection chain is rerun with the session's brandId so BYOK and brand
 * overrides keep working post-initiation.
 */
export async function resolveProviderForSession(
  session: ICallSession,
  initiatorUserId: string,
): Promise<VoiceProviderSelection | null> {
  return getProviderForCall({
    userId: initiatorUserId,
    brandId: session.brandId ? session.brandId.toString() : null,
    preferredProviderId: session.providerId,
  });
}
