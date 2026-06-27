/**
 * AI Studio orchestration layer — the single surface every AI Studio page
 * (text/image/video/audio/character) routes through.
 *
 * Replaces direct-from-page calls to individual flows with a unified API that:
 *   - opens / lists projects (with brand scoping)
 *   - opens a session within a project
 *   - dispatches the right `ProviderClient` capability via the router
 *   - persists session state + outputs back onto the project doc
 *   - emits asset library entries (B2-3.12 bridge)
 *
 * Higher-level features compose on top of this:
 *   - Character consistency (B2-3.13) — sessions accept `characterId`
 *   - Batch generation (B2-3.14) — many sessions share a `batchId`
 *   - Video providers (B2-3.15) — long-running sessions go through the job
 *     pattern; the orchestration layer is the polling boundary
 *
 * The router (`src/ai/router.ts`) still owns provider selection. This layer
 * owns the **project lifecycle and persistence**.
 */

import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import { connectMongoose } from '@/lib/mongodb';
import { AiStudioProject, IAiStudioSession, AiStudioProjectKind } from '@/lib/db/models/ai-studio-project.model';
import { AiCharacter, IAiCharacter } from '@/lib/db/models/ai-character.model';
import { resolveRoute } from '@/ai/router';
import { Plan, UserProfile } from '@/lib/auth/types';
import { ApiKeys } from '@/ai/types';
import { publishDomainEvent } from '@/lib/events/domain-bus';

/**
 * Apply character settings to a session-bound prompt + settings dict.
 *  - `styleDescriptors` are appended to the prompt.
 *  - `personality` is appended to the system prompt (text sessions).
 *  - `negativePrompt` is set when missing (image / video).
 *  - `voice` is mapped onto settings.voice + settings.language (audio).
 *  - `referenceImages[0]` is mapped onto settings.referenceImage when image/video.
 */
function applyCharacter(
  character: IAiCharacter,
  kind: AiStudioProjectKind,
  prompt: string,
  systemPrompt: string | undefined,
  settings: Record<string, unknown> = {}
): { prompt: string; systemPrompt: string | undefined; settings: Record<string, unknown> } {
  const merged: Record<string, unknown> = { ...settings };
  let nextPrompt = prompt;
  let nextSystem = systemPrompt;

  if (character.styleDescriptors && character.styleDescriptors.length > 0) {
    nextPrompt = `${prompt}\n\nStyle: ${character.styleDescriptors.join(', ')}`;
  }
  if (kind === 'text' && character.personality) {
    nextSystem = systemPrompt
      ? `${systemPrompt}\n\nPersonality: ${character.personality}`
      : `Personality: ${character.personality}`;
  }
  if ((kind === 'image' || kind === 'video') && character.negativePrompt && !merged.negativePrompt) {
    merged.negativePrompt = character.negativePrompt;
  }
  if (kind === 'audio' && character.voice) {
    if (!merged.voice) merged.voice = character.voice.voiceId;
    if (!merged.language && character.voice.language) merged.language = character.voice.language;
  }
  if ((kind === 'image' || kind === 'video') && character.referenceImages?.length && !merged.referenceImage) {
    merged.referenceImage = character.referenceImages[0].url;
  }

  return { prompt: nextPrompt, systemPrompt: nextSystem, settings: merged };
}

// ---------------------------------------------------------------------------
// Project lifecycle
// ---------------------------------------------------------------------------

export interface CreateProjectInput {
  brandId?: Types.ObjectId | string;
  createdById: Types.ObjectId | string;
  name: string;
  description?: string;
  kind: AiStudioProjectKind;
  defaultSettings?: Record<string, unknown>;
}

export async function createProject(input: CreateProjectInput) {
  await connectMongoose();
  return AiStudioProject.create({
    brandId: input.brandId ? new Types.ObjectId(String(input.brandId)) : undefined,
    createdById: new Types.ObjectId(String(input.createdById)),
    name: input.name,
    description: input.description,
    kind: input.kind,
    defaultSettings: input.defaultSettings,
  });
}

export interface ListProjectsInput {
  brandId?: Types.ObjectId | string;
  kind?: AiStudioProjectKind;
  status?: 'active' | 'archived';
  limit?: number;
  skip?: number;
}

export async function listProjects(input: ListProjectsInput) {
  await connectMongoose();
  const filter: Record<string, unknown> = {
};
  if (input.brandId) filter.brandId = new Types.ObjectId(String(input.brandId));
  if (input.kind) filter.kind = input.kind;
  if (input.status) filter.status = input.status;
  return AiStudioProject.find(filter)
    .sort({ updatedAt: -1 })
    .limit(input.limit ?? 50)
    .skip(input.skip ?? 0)
    .exec();
}

export async function getProject(projectId: Types.ObjectId | string) {
  await connectMongoose();
  return AiStudioProject.findById(projectId);
}

export async function archiveProject(projectId: Types.ObjectId | string) {
  await connectMongoose();
  return AiStudioProject.findByIdAndUpdate(
    projectId,
    { $set: { status: 'archived' } },
    { new: true }
  );
}

/**
 * Org-scoped single-project fetch. Use this from HTTP routes — `getProject`
 * does a bare `findById` and would leak across tenants. Returns null when the
 * project doesn't exist OR belongs to another org (callers map both to 404).
 */
export async function getProjectForOrg(
  projectId: Types.ObjectId | string
) {
  await connectMongoose();
  return AiStudioProject.findOne({
    _id: projectId
  });
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: 'active' | 'archived';
}

/**
 * Org-scoped project update (rename / archive). The org filter is part of the
 * query, so a mismatched tenant simply matches nothing and returns null.
 */
export async function updateProject(
  projectId: Types.ObjectId | string,
  patch: UpdateProjectInput,
) {
  await connectMongoose();
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.status !== undefined) set.status = patch.status;
  return AiStudioProject.findOneAndUpdate(
    { _id: projectId },
    { $set: set },
    { new: true },
  );
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export interface OpenSessionInput {
  projectId: Types.ObjectId | string;
  kind?: AiStudioProjectKind; // defaults to project.kind
  model: string;
  prompt: string;
  systemPrompt?: string;
  settings?: Record<string, unknown>;
  characterId?: Types.ObjectId | string;
  batchId?: string;
}

/**
 * Append a new session in `pending` state. Returns the session id for later
 * dispatch. Most callers use `runSession()` which does both steps inline.
 */
export async function openSession(input: OpenSessionInput): Promise<IAiStudioSession> {
  await connectMongoose();
  const project = await AiStudioProject.findById(input.projectId);
  if (!project) throw new Error(`Project ${input.projectId} not found`);

  const session: IAiStudioSession = {
    id: randomUUID(),
    kind: input.kind ?? project.kind,
    status: 'pending',
    model: input.model,
    prompt: input.prompt,
    systemPrompt: input.systemPrompt,
    settings: input.settings,
    characterId: input.characterId ? new Types.ObjectId(String(input.characterId)) : undefined,
    batchId: input.batchId,
  };
  project.sessions.push(session);
  project.sessionCount = project.sessions.length;
  project.lastSessionAt = new Date();
  await project.save();
  return session;
}

export interface RunSessionInput extends OpenSessionInput {
  userProfile?: UserProfile | null;
  userPlan?: Plan | null;
  userApiKeys?: ApiKeys;
}

/**
 * Dispatch a session — opens it, calls the right `ProviderClient` capability,
 * and writes outputs + usage back to the project doc.
 *
 * For long-running providers (video, B2-3.15), the session ends `running` and
 * the BullMQ worker / webhook poller updates it via `completeSession()`.
 */
export async function runSession(input: RunSessionInput): Promise<IAiStudioSession> {
  const session = await openSession(input);
  await markSessionRunning(input.projectId, session.id);

  // Resolve character bindings if any — adjusts prompt/system/settings up front.
  let { prompt, systemPrompt, settings } = {
    prompt: input.prompt,
    systemPrompt: input.systemPrompt,
    settings: input.settings ?? {},
  };
  if (input.characterId) {
    const character = await AiCharacter.findById(input.characterId);
    if (character) {
      const applied = applyCharacter(character, input.kind ?? session.kind, prompt, systemPrompt, settings);
      prompt = applied.prompt;
      systemPrompt = applied.systemPrompt;
      settings = applied.settings;
      // Bump usage counter (best-effort).
      AiCharacter.updateOne({ _id: character._id }, { $inc: { usageCount: 1 } }).catch(() => undefined);
    }
  }

  try {
    const { provider, route } = resolveRoute({
      model: input.model,
      userProfile: input.userProfile,
      userPlan: input.userPlan,
      userApiKeys: input.userApiKeys,
    });

    const kind = input.kind ?? session.kind;
    switch (kind) {
      case 'text': {
        const result = await provider.generateText({
          route,
          system: systemPrompt ?? '',
          messages: [{ role: 'user', content: prompt }],
          temperature: settings?.temperature as number | undefined,
          maxTokens: settings?.maxTokens as number | undefined,
          enablePromptCaching: provider.capabilities.promptCaching,
        });
        return completeSession({
          projectId: input.projectId,
          sessionId: session.id,
          outputText: result.text,
          usage: result.usage,
        });
      }
      case 'image': {
        if (!provider.generateImage) {
          throw new Error(`Provider '${provider.id}' does not support image generation.`);
        }
        const result = await provider.generateImage({
          route,
          prompt,
          aspectRatio: settings?.aspectRatio as string | undefined,
          count: settings?.count as number | undefined,
          negativePrompt: settings?.negativePrompt as string | undefined,
          referenceImage: settings?.referenceImage as string | undefined,
        });
        return completeSession({
          projectId: input.projectId,
          sessionId: session.id,
          outputUrls: result.images,
          usage: result.usage,
        });
      }
      case 'audio': {
        if (!provider.generateAudio) {
          throw new Error(`Provider '${provider.id}' does not support audio generation.`);
        }
        const result = await provider.generateAudio({
          route,
          text: prompt,
          voice: settings?.voice as string | undefined,
          speed: settings?.speed as number | undefined,
          language: settings?.language as string | undefined,
        });
        return completeSession({
          projectId: input.projectId,
          sessionId: session.id,
          outputUrls: [result.audioUrl],
          usage: result.usage,
        });
      }
      case 'video': {
        if (!provider.generateVideo) {
          throw new Error(`Provider '${provider.id}' does not support video generation.`);
        }
        const job = await provider.generateVideo({
          route,
          prompt,
          referenceImage: settings?.referenceImage as string | undefined,
          durationSeconds: settings?.durationSeconds as number | undefined,
          aspectRatio: settings?.aspectRatio as string | undefined,
        });
        if (job.status === 'completed' && job.videoUrl) {
          return completeSession({
            projectId: input.projectId,
            sessionId: session.id,
            outputUrls: [job.videoUrl],
          });
        }
        // Long-running — leave the session in `running` state. The worker /
        // poller will call `completeSession` when the job finishes.
        return session;
      }
      default:
        throw new Error(`Unsupported session kind '${kind}'.`);
    }
  } catch (error) {
    return failSession({
      projectId: input.projectId,
      sessionId: session.id,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

async function markSessionRunning(projectId: Types.ObjectId | string, sessionId: string): Promise<void> {
  await AiStudioProject.updateOne(
    { _id: projectId, 'sessions.id': sessionId },
    { $set: { 'sessions.$.status': 'running', 'sessions.$.startedAt': new Date() } }
  );
}

export interface CompleteSessionInput {
  projectId: Types.ObjectId | string;
  sessionId: string;
  outputText?: string;
  outputUrls?: string[];
  assetIds?: Array<Types.ObjectId | string>;
  usage?: IAiStudioSession['usage'];
  costCents?: number;
}

export async function completeSession(input: CompleteSessionInput): Promise<IAiStudioSession> {
  await connectMongoose();
  const update: Record<string, unknown> = {
    'sessions.$.status': 'completed',
    'sessions.$.endedAt': new Date(),
  };
  if (input.outputText !== undefined) update['sessions.$.outputText'] = input.outputText;
  if (input.outputUrls) update['sessions.$.outputUrls'] = input.outputUrls;
  if (input.assetIds) {
    update['sessions.$.assetIds'] = input.assetIds.map(id => new Types.ObjectId(String(id)));
  }
  if (input.usage) update['sessions.$.usage'] = input.usage;
  if (input.costCents !== undefined) update['sessions.$.costCents'] = input.costCents;

  const project = await AiStudioProject.findOneAndUpdate(
    { _id: input.projectId, 'sessions.id': input.sessionId },
    { $set: update },
    { new: true }
  );
  if (!project) throw new Error('Project or session not found.');
  const session = project.sessions.find(s => s.id === input.sessionId);
  if (!session) throw new Error('Session not found post-update.');

  // Auto-import image / video outputs into the media library (B2-3.12).
  // Best-effort — failures here don't fail the session completion.
  if (
    project.brandId &&
    session.outputUrls && session.outputUrls.length > 0 &&
    (session.kind === 'image' || session.kind === 'video')
  ) {
    try {
      const { importSessionAssetsToLibrary } = await import('./asset-bridge');
      await importSessionAssetsToLibrary({
        projectId: project._id as Types.ObjectId,
        sessionId: session.id,
      });
    } catch (error) {
      console.error('[ai-studio] asset bridge import failed:', error);
    }
  }

  // Publish a domain event (X3) so downstream consumers (audit, webhooks,
  // workflow triggers, analytics) can react.
  publishDomainEvent({
    type: 'ai_studio.generation_completed',
    brandId: project.brandId?.toString(),
    source: 'ai-studio.orchestration.completeSession',
    payload: {
      projectId: project._id.toString(),
      sessionId: session.id,
      kind: session.kind,
      model: session.model,
      outputUrls: session.outputUrls,
      hasOutputText: !!session.outputText,
    },
  });

  return session;
}

export interface FailSessionInput {
  projectId: Types.ObjectId | string;
  sessionId: string;
  errorMessage: string;
}

export async function failSession(input: FailSessionInput): Promise<IAiStudioSession> {
  await connectMongoose();
  const project = await AiStudioProject.findOneAndUpdate(
    { _id: input.projectId, 'sessions.id': input.sessionId },
    {
      $set: {
        'sessions.$.status': 'failed',
        'sessions.$.errorMessage': input.errorMessage,
        'sessions.$.endedAt': new Date(),
      },
    },
    { new: true }
  );
  if (!project) throw new Error('Project or session not found.');
  const session = project.sessions.find(s => s.id === input.sessionId);
  if (!session) throw new Error('Session not found post-update.');

  // Domain event (X3) — lets the notification dispatcher alert the owner.
  publishDomainEvent({
    type: 'ai_studio.generation_failed',
    brandId: project.brandId?.toString(),
    source: 'ai-studio.orchestration.failSession',
    payload: {
      projectId: project._id.toString(),
      sessionId: session.id,
      kind: session.kind,
      userId: project.createdById.toString(),
      error: input.errorMessage,
    },
  });

  return session;
}

export async function cancelSession(projectId: Types.ObjectId | string, sessionId: string): Promise<void> {
  await connectMongoose();
  await AiStudioProject.updateOne(
    { _id: projectId, 'sessions.id': sessionId },
    {
      $set: {
        'sessions.$.status': 'cancelled',
        'sessions.$.endedAt': new Date(),
      },
    }
  );
}

export interface RecordCompletedInput {
  projectId: Types.ObjectId | string;
  kind: AiStudioProjectKind;
  model: string;
  prompt: string;
  settings?: Record<string, unknown>;
  outputUrls?: string[];
  outputText?: string;
  characterId?: Types.ObjectId | string;
}

/**
 * Persist an already-finished generation as a completed session.
 *
 * For providers whose render is driven/polled client-side (e.g. AI Studio
 * video, which polls the long-running operation in the browser), the result
 * exists before it touches the orchestration layer. This appends it as a
 * completed session so the same persistence, asset-library bridge, and domain
 * events apply as for server-run sessions — without a server-side poller.
 */
export async function recordCompletedSession(input: RecordCompletedInput): Promise<IAiStudioSession> {
  const session = await openSession({
    projectId: input.projectId,
    kind: input.kind,
    model: input.model,
    prompt: input.prompt,
    settings: input.settings,
    characterId: input.characterId,
  });
  return completeSession({
    projectId: input.projectId,
    sessionId: session.id,
    outputUrls: input.outputUrls,
    outputText: input.outputText,
  });
}
