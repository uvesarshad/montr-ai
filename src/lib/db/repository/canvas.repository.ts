import mongoose from 'mongoose';
import Canvas, { ICanvas } from '../models/canvas.model';

export interface CreateCanvasDto {
    userId: string;
    /** Agency mode (B2-5.4) — brand scope. Optional. */
    brandId?: string;
    name: string;
    data?: string;
}

export interface UpdateCanvasDto {
    name?: string;
    data?: string;
    previewKey?: string;
}

export class CanvasRepository {
    /**
     * Find all canvases for a user
     * Searches by both MongoDB _id and firebaseUid (for migrated users)
     */
    async findByUserId(
        userId: string,
        sortBy: 'updatedAt' | 'name' = 'updatedAt',
        firebaseUid?: string,
        brandId?: string | null,
    ): Promise<ICanvas[]> {
        await this.ensureConnection();

        const sortOrder: Record<string, 1 | -1> = sortBy === 'updatedAt' ? { updatedAt: -1 } : { name: 1 };

        // Query by userId OR firebaseUid to support migrated users
        const userIds = [userId];
        if (firebaseUid) {
            userIds.push(firebaseUid);
        }

        // Agency mode (B2-5.4): when a brandId is supplied, filter to that
        // brand's canvases only. `null` means "All brands" (the picker's
        // sentinel) and falls through to the unfiltered query.
        const query: Record<string, unknown> = { userId: { $in: userIds } };
        if (brandId) query.brandId = brandId;

        return Canvas.find(query).sort(sortOrder).exec();
    }

    /**
     * Find canvas by ID
     */
    async findById(canvasId: string, userId: string, firebaseUid?: string): Promise<ICanvas | null> {
        await this.ensureConnection();

        const userIds = [userId];
        if (firebaseUid) {
            userIds.push(firebaseUid);
        }

        return Canvas.findOne({ _id: canvasId, userId: { $in: userIds } }).exec();
    }

    /**
     * Create new canvas
     */
    async create(data: CreateCanvasDto): Promise<ICanvas> {
        await this.ensureConnection();

        const canvas = new Canvas({
            userId: data.userId,
            name: data.name,
            data: data.data || JSON.stringify({ nodes: [], edges: [] }),
        });

        return canvas.save();
    }

    /**
     * Update canvas
     */
    async update(canvasId: string, userId: string, data: UpdateCanvasDto, firebaseUid?: string): Promise<ICanvas | null> {
        await this.ensureConnection();

        const userIds = [userId];
        if (firebaseUid) {
            userIds.push(firebaseUid);
        }

        return Canvas.findOneAndUpdate(
            { _id: canvasId, userId: { $in: userIds } },
            { $set: data },
            { new: true }
        ).exec();
    }

    /**
     * Delete canvas
     */
    async delete(canvasId: string, userId: string, firebaseUid?: string): Promise<boolean> {
        await this.ensureConnection();

        const userIds = [userId];
        if (firebaseUid) {
            userIds.push(firebaseUid);
        }

        const result = await Canvas.deleteOne({ _id: canvasId, userId: { $in: userIds } }).exec();
        return result.deletedCount > 0;
    }

    /**
     * Count canvases for a user
     */
    async countByUserId(userId: string, firebaseUid?: string): Promise<number> {
        await this.ensureConnection();

        const userIds = [userId];
        if (firebaseUid) {
            userIds.push(firebaseUid);
        }

        return Canvas.countDocuments({ userId: { $in: userIds } }).exec();
    }

    /**
     * Ensure MongoDB connection via Mongoose
     */
    private async ensureConnection(): Promise<void> {
        if (mongoose.connection.readyState !== 1) {
            const { connectMongoose } = await import('@/lib/mongodb');
            await connectMongoose();
        }
    }
}

// Export singleton instance
export const canvasRepository = new CanvasRepository();
