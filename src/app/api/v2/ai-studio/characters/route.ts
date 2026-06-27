/**
 * AI Studio characters — list / create.
 *
 * GET  /api/v2/ai-studio/characters?brandId=&status=   (brand's own + shared)
 * POST /api/v2/ai-studio/characters                     body: CreateCharacter
 *
 * Org-scoped; brand-aware (a character without brandId is shared across the org).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { listCharacters, createCharacter } from '@/lib/ai-studio/characters';
import type {
  IAiCharacterAvatar,
  IAiCharacterReferenceImage,
  IAiCharacterVoice,
} from '@/lib/db/models/ai-character.model';

function readBrandId(searchParams: URLSearchParams): string | undefined {
  const raw = searchParams.get('brandId');
  if (!raw || raw === 'all' || raw === '') return undefined;
  return raw;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const status = (searchParams.get('status') as 'active' | 'archived' | null) ?? 'active';

  try {
    const characters = await listCharacters({
      brandId: readBrandId(searchParams),
      status,
    });
    return NextResponse.json({ characters });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

interface CreateBody {
  name: string;
  brandId?: string | null;
  description?: string;
  styleDescriptors?: string[];
  personality?: string;
  referenceImages?: IAiCharacterReferenceImage[];
  voice?: IAiCharacterVoice;
  avatar?: IAiCharacterAvatar;
  negativePrompt?: string;
  loraModelId?: string;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json()) as CreateBody;
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  try {
    const character = await createCharacter({
      brandId: body.brandId ?? undefined,
      createdById: session.user.id,
      name: body.name.trim(),
      description: body.description,
      styleDescriptors: body.styleDescriptors,
      personality: body.personality,
      referenceImages: body.referenceImages,
      voice: body.voice,
      avatar: body.avatar,
      negativePrompt: body.negativePrompt,
      loraModelId: body.loraModelId,
    });
    return NextResponse.json({ character }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
