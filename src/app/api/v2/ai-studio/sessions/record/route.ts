/**
 * POST /api/v2/ai-studio/sessions/record
 *
 * Persist an already-finished generation (result computed client-side) as a
 * completed session. Used by AI Studio video, whose long-running render is
 * polled in the browser — the orchestration `video` run path expects a
 * server-side worker/poller that Studio doesn't have yet, so the browser drives
 * the poll and posts the finished URL here.
 *
 * Mirrors /sessions/run for project creation + brand scoping, so the asset
 * bridge and domain events fire identically.
 *
 * Body:
 *   {
 *     projectId?: string, projectName?: string,
 *     kind: 'image' | 'video' | 'audio' | 'text',
 *     model: string, prompt: string,
 *     settings?: Record<string, unknown>,
 *     outputUrls?: string[], outputText?: string,
 *     characterId?: string, brandId?: string,
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { createProject, recordCompletedSession } from '@/lib/ai-studio/orchestration';
import type { AiStudioProjectKind } from '@/lib/db/models/ai-studio-project.model';

interface RecordBody {
  projectId?: string;
  projectName?: string;
  kind: AiStudioProjectKind;
  model: string;
  prompt: string;
  settings?: Record<string, unknown>;
  outputUrls?: string[];
  outputText?: string;
  characterId?: string;
  brandId?: string;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const body = (await request.json()) as RecordBody;
  if (!body.kind || !body.model || !body.prompt) {
    return NextResponse.json({ error: 'kind, model, and prompt are required' }, { status: 400 });
  }
  if ((!body.outputUrls || body.outputUrls.length === 0) && !body.outputText) {
    return NextResponse.json({ error: 'outputUrls or outputText is required' }, { status: 400 });
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

    const result = await recordCompletedSession({
      projectId,
      kind: body.kind,
      model: body.model,
      prompt: body.prompt,
      settings: body.settings,
      outputUrls: body.outputUrls,
      outputText: body.outputText,
      characterId: body.characterId,
    });

    return NextResponse.json({ projectId, session: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
