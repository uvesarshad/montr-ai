/**
 * AI Studio ↔ Media Asset bridge.
 *
 * Lifts AI Studio outputs into the canonical media-asset collection so they
 * show up in the asset library, can be searched, tagged, used in social
 * posts, attached to workflows, and embedded in marketing emails.
 *
 * Called by the orchestration layer when a session completes with image or
 * video outputs. Text outputs stay on the session doc — they're not media.
 */

import { Types } from 'mongoose';
import { connectMongoose } from '@/lib/mongodb';
import MediaAsset, { IMediaAsset } from '@/lib/db/models/media-asset.model';
import { AiStudioProject } from '@/lib/db/models/ai-studio-project.model';

export interface ImportSessionAssetsInput {
  projectId: Types.ObjectId | string;
  sessionId: string;
  /** Falls back to project.brandId when omitted. */
  brandId?: string;
  /** Falls back to project.createdById when omitted. */
  userId?: string;
  /** Override the asset type — defaults to 'image' when extension is image-like, else 'video'. */
  typeOverride?: 'image' | 'video';
  /** Tags to apply to the new assets (additive). */
  tags?: string[];
}

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];

function detectType(url: string): 'image' | 'video' {
  if (url.startsWith('data:image/')) return 'image';
  if (url.startsWith('data:video/')) return 'video';
  const path = url.split('?')[0].toLowerCase();
  return IMAGE_EXT.some(ext => path.endsWith(ext)) ? 'image' : 'video';
}

function detectMime(url: string, type: 'image' | 'video'): string {
  if (url.startsWith('data:')) {
    const m = url.match(/^data:([^;]+);/);
    if (m) return m[1];
  }
  return type === 'image' ? 'image/png' : 'video/mp4';
}

function filenameFromUrl(url: string, fallback: string): string {
  if (url.startsWith('data:')) return fallback;
  const path = url.split('?')[0];
  const last = path.split('/').pop();
  return last || fallback;
}

/**
 * Import all output URLs from a completed session into the media-asset
 * collection. Writes the new asset ids back onto the session.
 *
 * Idempotent — re-running on the same session updates rather than duplicates,
 * because the session's `assetIds` already point at the existing rows.
 */
export async function importSessionAssetsToLibrary(
  input: ImportSessionAssetsInput
): Promise<IMediaAsset[]> {
  await connectMongoose();
  const project = await AiStudioProject.findById(input.projectId);
  if (!project) throw new Error(`Project ${input.projectId} not found.`);
  const session = project.sessions.find(s => s.id === input.sessionId);
  if (!session) throw new Error(`Session ${input.sessionId} not found.`);
  if (session.status !== 'completed') {
    throw new Error(`Session ${input.sessionId} is in status '${session.status}'; only completed sessions can be imported.`);
  }

  const urls = session.outputUrls ?? [];
  if (urls.length === 0) return [];

  const brandId = input.brandId ?? project.brandId?.toString();
  if (!brandId) {
    throw new Error('No brandId available — project must have brandId set, or pass brandId override.');
  }
  const userId = input.userId ?? project.createdById.toString();

  const existingAssetIds = (session.assetIds ?? []).map(id => id.toString());
  const assets: IMediaAsset[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const type = input.typeOverride ?? detectType(url);
    const mimeType = detectMime(url, type);
    const filename = filenameFromUrl(url, `ai-${session.id}-${i}.${type === 'image' ? 'png' : 'mp4'}`);

    // Update-or-insert per existing assetId / per fresh row.
    let asset: IMediaAsset | null = null;
    if (existingAssetIds[i]) {
      asset = await MediaAsset.findByIdAndUpdate(
        existingAssetIds[i],
        {
          $set: {
            url,
            type,
            mimeType,
            filename,
            originalName: filename,
            sourcePrompt: session.prompt,
            tags: Array.from(new Set([...(input.tags ?? []), 'ai-studio'])),
          },
        },
        { new: true }
      );
    }
    if (!asset) {
      asset = await MediaAsset.create({
        brandId,
        userId,
        url,
        type,
        filename,
        originalName: filename,
        mimeType,
        size: 0, // unknown for data URLs; calling code can backfill after upload to S3
        tags: Array.from(new Set([...(input.tags ?? []), 'ai-studio'])),
        usageCount: 0,
        aiStudioProjectId: String(input.projectId),
        aiStudioSessionId: input.sessionId,
        sourcePrompt: session.prompt,
        sourceProvider: (session.settings?.provider as string | undefined) ?? undefined,
      });
    }
    if (asset) assets.push(asset);
  }

  // Persist asset ids back onto the session.
  await AiStudioProject.updateOne(
    { _id: input.projectId, 'sessions.id': input.sessionId },
    { $set: { 'sessions.$.assetIds': assets.map(a => a._id) } }
  );

  return assets;
}

/**
 * Inverse — given an asset id, return the AI Studio session that produced it.
 * Lets "open source session" surfaces work from the media library card.
 */
export async function findSessionForAsset(assetId: Types.ObjectId | string) {
  await connectMongoose();
  const asset = await MediaAsset.findById(assetId);
  if (!asset?.aiStudioProjectId) return null;
  const project = await AiStudioProject.findById(asset.aiStudioProjectId);
  if (!project) return null;
  const session = project.sessions.find(s => s.id === asset.aiStudioSessionId);
  return session ? { project, session } : null;
}
