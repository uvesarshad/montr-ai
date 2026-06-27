/**
 * POST /api/v2/ai-studio/sessions/run
 *
 * Single entry point for AI generation that goes through the orchestration
 * layer (B2-3.11). Both AI Studio pages and canvas-node "Generate" buttons
 * should call this — instead of importing flows or calling `generateImage()`
 * directly — so plan-tier gating, character bindings, asset-library import,
 * and provenance are uniform.
 *
 * Body:
 *   {
 *     projectId?: string,       // when omitted, a transient project is created
 *     projectName?: string,     // used only when creating a transient project
 *     kind: 'text' | 'image' | 'video' | 'audio',
 *     model: string,
 *     prompt: string,
 *     systemPrompt?: string,
 *     settings?: Record<string, unknown>,
 *     characterId?: string,
 *     brandId?: string,
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { createProject, runSession } from '@/lib/ai-studio/orchestration';

interface RunBody {
  projectId?: string;
  projectName?: string;
  kind: 'text' | 'image' | 'video' | 'audio';
  model: string;
  prompt: string;
  systemPrompt?: string;
  settings?: Record<string, unknown>;
  characterId?: string;
  brandId?: string;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const body = (await request.json()) as RunBody;
  if (!body.kind || !body.model || !body.prompt) {
    return NextResponse.json({ error: 'kind, model, and prompt are required' }, { status: 400 });
  }

  try {
    let projectId = body.projectId;
    if (!projectId) {
      const created = await createProject({
        brandId: body.brandId,
        createdById: userId,
        kind: body.kind,
        name: body.projectName ?? `Quick ${body.kind} session`,
      });
      projectId = String(created._id);
    }

    const result = await runSession({
      projectId,
      kind: body.kind,
      model: body.model,
      prompt: body.prompt,
      systemPrompt: body.systemPrompt,
      settings: body.settings,
      characterId: body.characterId,
    });

    return NextResponse.json({ projectId, session: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /unauthorized|access denied|not unlock/i.test(message) ? 403
      : /not found/i.test(message) ? 404
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
