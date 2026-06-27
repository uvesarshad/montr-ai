import mongoose from 'mongoose';
import DocumentModel, { IDocument } from '../models/document.model';

export interface CreateDocumentDto {
    userId: string;
    title: string;
    content?: string;
    folderId?: string | null;
    referenceId?: string | null;
    referenceType?: string | null;
}

export interface UpdateDocumentDto {
    title?: string;
    content?: string;
    referenceId?: string | null;
    referenceType?: string | null;
    isPublished?: boolean;
    publishedUrl?: string;
    publishedUsername?: string;
    coverImage?: string;
    isPasswordProtected?: boolean;
    password?: string | null;
}

export class DocumentRepository {
    /**
     * Find all documents for a user
     * Searches by both MongoDB _id and firebaseUid (for migrated users)
     */
    async findByUserId(userId: string, sortBy: 'updatedAt' | 'title' = 'updatedAt', firebaseUid?: string): Promise<IDocument[]> {
        await this.ensureConnection();

        const sortOrder: Record<string, 1 | -1> = sortBy === 'updatedAt' ? { updatedAt: -1 } : { title: 1 };

        // Query by userId OR firebaseUid to support migrated users
        const userIds = [userId];
        if (firebaseUid) {
            userIds.push(firebaseUid);
        }

        return DocumentModel.find({ userId: { $in: userIds } }).sort(sortOrder).exec();
    }

    /**
     * Find document by ID
     */
    async findById(docId: string, userId: string, firebaseUid?: string): Promise<IDocument | null> {
        await this.ensureConnection();

        const userIds = [userId];
        if (firebaseUid) {
            userIds.push(firebaseUid);
        }

        return DocumentModel.findOne({ _id: docId, userId: { $in: userIds } }).exec();
    }

    /**
     * Find published document by username and doc ID (for public access)
     */
    async findPublishedDocument(docId: string, username?: string): Promise<IDocument | null> {
        await this.ensureConnection();

        const query: Record<string, unknown> = { _id: docId, isPublished: true };
        if (username) {
            query.publishedUsername = username;
        }

        return DocumentModel.findOne(query).exec();
    }

    /**
     * Create new document
     */
    async create(data: CreateDocumentDto): Promise<IDocument> {
        await this.ensureConnection();

        const document = new DocumentModel({
            userId: data.userId,
            title: data.title,
            content: data.content || '',
            folderId: data.folderId || null,
            referenceId: data.referenceId || null,
            referenceType: data.referenceType || null,
            isPublished: false,
        });

        return document.save();
    }

    /**
     * Update document
     */
    async update(docId: string, userId: string, data: UpdateDocumentDto, firebaseUid?: string): Promise<IDocument | null> {
        await this.ensureConnection();

        const userIds = [userId];
        if (firebaseUid) {
            userIds.push(firebaseUid);
        }

        return DocumentModel.findOneAndUpdate(
            { _id: docId, userId: { $in: userIds } },
            { $set: data },
            { new: true }
        ).exec();
    }

    /**
     * Delete document
     */
    async delete(docId: string, userId: string, firebaseUid?: string): Promise<boolean> {
        await this.ensureConnection();

        const userIds = [userId];
        if (firebaseUid) {
            userIds.push(firebaseUid);
        }

        const result = await DocumentModel.deleteOne({ _id: docId, userId: { $in: userIds } }).exec();
        return result.deletedCount > 0;
    }

    /**
     * Count documents for a user
     */
    async countByUserId(userId: string, firebaseUid?: string): Promise<number> {
        await this.ensureConnection();

        const userIds = [userId];
        if (firebaseUid) {
            userIds.push(firebaseUid);
        }

        return DocumentModel.countDocuments({ userId: { $in: userIds } }).exec();
    }

    /**
     * Get all published documents
     */
    async findAllPublished(limit: number = 50): Promise<IDocument[]> {
        await this.ensureConnection();

        return DocumentModel.find({ isPublished: true })
            .sort({ updatedAt: -1 })
            .limit(limit)
            .exec();
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
export const documentRepository = new DocumentRepository();
