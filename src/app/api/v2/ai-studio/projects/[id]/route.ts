/**
 * AI Studio single-project route.
 *
 * GET    /api/v2/ai-studio/projects/[id]   → one project (org-scoped) — used by
 *        the unified workspace to restore a thread's mode + sessions on select.
 * PATCH  /api/v2/ai-studio/projects/[id]   → rename / set status
 *        body: { name?, description?, status?: 'active' | 'archived' }
 * DELETE /api/v2/ai-studio/projects/[id]   → soft-delete (archive)
 *
 * Multi-tenancy: the orchestration `getProject()` does a bare findById, so all
 * three handlers go through the org-scoped helpers (`getProjectForOrg` /
 * `updateProject`). A project from another org returns 404, never its contents.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { getProjectForOrg, updateProject } from '@/lib/ai-studio/orchestration';

async function requireOrg() {
  const session = await getSession();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  }
  return { } as const;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireOrg();
  if ('error' in ctx) return ctx.error;
  const { id } = await params;

  try {
    const project = await getProjectForOrg(id);
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

interface PatchBody {
  name?: string;
  description?: string;
  status?: 'active' | 'archived';
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireOrg();
  if ('error' in ctx) return ctx.error;
  const { id } = await params;

  const body = (await request.json()) as PatchBody;
  if (body.status && body.status !== 'active' && body.status !== 'archived') {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  try {
    const project = await updateProject(id, {
      name: body.name,
      description: body.description,
      status: body.status,
    });
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireOrg();
  if ('error' in ctx) return ctx.error;
  const { id } = await params;

  try {
    const project = await updateProject(id, { status: 'archived' });
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
