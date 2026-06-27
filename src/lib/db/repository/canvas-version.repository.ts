import mongoose from 'mongoose';
import CanvasVersionModel, { ICanvasVersion } from '../models/canvas-version.model';

/** Max snapshots retained per canvas. Oldest are pruned on insert. */
const MAX_VERSIONS_PER_CANVAS = 50;
/** Minimum gap between auto-save checkpoints (ms). */
const AUTO_CHECKPOINT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export interface CreateCanvasVersionDto {
    canvasId: string;
    userId: string;
    data: string;
    saveKind: 'manual' | 'auto';
    label?: string;
}

export class CanvasVersionRepository {
    /**
     * Snapshot the current canvas state subject to policy:
     *  - manual saves: always snapshot
     *  - auto saves: at most one checkpoint per AUTO_CHECKPOINT_INTERVAL_MS
     *  - skip when data is identical to the latest snapshot
     * Prunes oldest beyond MAX_VERSIONS_PER_CANVAS. Returns the created
     * version, or null when the snapshot was skipped by policy.
     */
    async snapshot(dto: CreateCanvasVersionDto): Promise<ICanvasVersion | null> {
        await this.ensureConnection();

        const latest = await CanvasVersionModel.findOne({ canvasId: dto.canvasId })
            .sort({ version: -1 })
            .select('version data createdAt')
            .lean();

        // Skip when nothing changed since the last snapshot.
        if (latest && latest.data === dto.data) {
            return null;
        }

        // Auto-save throttle: don't checkpoint more than once per interval.
        if (dto.saveKind === 'auto' && latest?.createdAt) {
            const elapsed = Date.now() - new Date(latest.createdAt).getTime();
            if (elapsed < AUTO_CHECKPOINT_INTERVAL_MS) {
                return null;
            }
        }

        const nextVersion = (latest?.version || 0) + 1;

        const created = await CanvasVersionModel.create({
            canvasId: dto.canvasId,
            userId: dto.userId,
            version: nextVersion,
            data: dto.data,
            saveKind: dto.saveKind,
            label: dto.label ?? null,
        });

        await this.prune(dto.canvasId);

        return created;
    }

    /**
     * Force a snapshot regardless of throttle (used for safety backups on
     * restore). Still skips when data is identical to the latest snapshot.
     */
    async forceSnapshot(dto: CreateCanvasVersionDto): Promise<ICanvasVersion | null> {
        await this.ensureConnection();

        const latest = await CanvasVersionModel.findOne({ canvasId: dto.canvasId })
            .sort({ version: -1 })
            .select('version data')
            .lean();

        if (latest && latest.data === dto.data) {
            return null;
        }

        const nextVersion = (latest?.version || 0) + 1;

        const created = await CanvasVersionModel.create({
            canvasId: dto.canvasId,
            userId: dto.userId,
            version: nextVersion,
            data: dto.data,
            saveKind: dto.saveKind,
            label: dto.label ?? null,
        });

        await this.prune(dto.canvasId);

        return created;
    }

    /** List version metadata (no data blobs) for a canvas, newest first. */
    async listMetadata(canvasId: string): Promise<Array<Omit<ICanvasVersion, 'data'>>> {
        await this.ensureConnection();

        return CanvasVersionModel.find({ canvasId })
            .sort({ version: -1 })
            .select('-data')
            .limit(MAX_VERSIONS_PER_CANVAS)
            .lean() as unknown as Array<Omit<ICanvasVersion, 'data'>>;
    }

    /** Get a single version (including data) scoped to its canvas. */
    async findById(versionId: string, canvasId: string): Promise<ICanvasVersion | null> {
        await this.ensureConnection();

        return CanvasVersionModel.findOne({ _id: versionId, canvasId }).lean() as unknown as ICanvasVersion | null;
    }

    /** Delete oldest versions beyond the per-canvas cap. */
    private async prune(canvasId: string): Promise<void> {
        const stale = await CanvasVersionModel.find({ canvasId })
            .sort({ version: -1 })
            .skip(MAX_VERSIONS_PER_CANVAS)
            .select('_id')
            .lean();

        if (stale.length > 0) {
            await CanvasVersionModel.deleteMany({ _id: { $in: stale.map(v => v._id) } });
        }
    }

    private async ensureConnection(): Promise<void> {
        if (mongoose.connection.readyState !== 1) {
            const { connectMongoose } = await import('@/lib/mongodb');
            await connectMongoose();
        }
    }
}

export const canvasVersionRepository = new CanvasVersionRepository();
