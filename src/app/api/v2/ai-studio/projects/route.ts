/**
 * AI Studio projects — list / create endpoints.
 *
 * GET  /api/v2/ai-studio/projects?brandId=&kind=&status=&limit=&skip=
 * POST /api/v2/ai-studio/projects   body: { name, kind, description?, brandId?, defaultSettings? }
 *
 * Honors the agency-mode brand picker (B2-NEW.3) — when `brandId` is set, the
 * list is scoped to that brand only. Missing / empty / `all` returns the
 * organization-wide list.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { createProject, listProjects } from '@/lib/ai-studio/orchestration';
import { AiStudioProjectKind } from '@/lib/db/models/ai-studio-project.model';

function readBrandId(searchParams: URLSearchParams): string | undefined {
  const raw = searchParams.get('brandId');
  if (!raw || raw === 'all' || raw === '') return undefined;
  return raw;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const brandId = readBrandId(searchParams);
  const kind = searchParams.get('kind') as AiStudioProjectKind | null;
  const status = (searchParams.get('status') as 'active' | 'archived' | null) ?? 'active';
  const limit = Number(searchParams.get('limit') ?? '50');
  const skip = Number(searchParams.get('skip') ?? '0');

  try {
    const projects = await listProjects({
      brandId,
      kind: kind ?? undefined,
      status,
      limit,
      skip,
    });
    return NextResponse.json({ projects });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

interface CreateBody {
  name: string;
  kind: AiStudioProjectKind;
  description?: string;
  brandId?: string | null;
  defaultSettings?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json()) as CreateBody;
  if (!body.name || !body.kind) {
    return NextResponse.json({ error: 'name and kind are required' }, { status: 400 });
  }

  try {
    const project = await createProject({
      brandId: body.brandId ?? undefined,
      createdById: session.user.id,
      name: body.name,
      description: body.description,
      kind: body.kind,
      defaultSettings: body.defaultSettings,
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
