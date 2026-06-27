/**
 * AI Studio single character — GET / PATCH / DELETE (archive). Org-scoped.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import {
  getCharacterForOrg,
  updateCharacter,
  archiveCharacter,
  type UpdateCharacterInput,
} from '@/lib/ai-studio/characters';

async function requireOrg() {
  const session = await getSession();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  }
  return { } as const;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg();
  if ('error' in ctx) return ctx.error;
  const { id } = await params;
  try {
    const character = await getCharacterForOrg(id);
    if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ character });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg();
  if ('error' in ctx) return ctx.error;
  const { id } = await params;
  const body = (await request.json()) as UpdateCharacterInput;
  try {
    const character = await updateCharacter(id, body);
    if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ character });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg();
  if ('error' in ctx) return ctx.error;
  const { id } = await params;
  try {
    const character = await archiveCharacter(id);
    if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
