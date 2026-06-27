import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Knowledge Base Model
 * Stores documents and their embeddings for semantic search
 */
export interface IKnowledgeBase extends Document {
    /** Brand scope (B3-4.6.1). Normalized to ObjectId 2026-05-22; legacy string values
     * coerce on read via the schema's `set` hook. */
    brandId?: Types.ObjectId | null;
    name: string;
    description?: string;
    type: 'document' | 'url' | 'text' | 'faq' | 'pdf' | 'social_report' | 'crm_contact' | 'crm_deal' | 'inbox_thread' | 'form' | 'ai_memory';
    sourceModule?: 'manual' | 'copilot' | 'crm' | 'social' | 'inbox' | 'forms' | 'documents';

    // Content
    content: string;
    metadata?: {
        title?: string;
        url?: string;
        fileName?: string;
        fileSize?: number;
        mimeType?: string;
        author?: string;
        tags?: string[];
    };

    // Vector embedding for semantic search
    embedding?: number[];
    embeddingModel?: string; // e.g., 'text-embedding-ada-002'

    // Chunking (for large documents)
    chunks?: {
        content: string;
        embedding?: number[];
        startIndex: number;
        endIndex: number;
    }[];

    isActive: boolean;
    createdById: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const KnowledgeBaseSchema = new Schema<IKnowledgeBase>(
    {
        brandId: {
            type: Schema.Types.ObjectId,
            ref: 'Brand',
            default: null,
            index: true,
            // Coerce any legacy string values that were written before the
            // ObjectId normalization on 2026-05-22.
            set: (v: unknown) => {
                if (v == null) return v;
                if (typeof v === 'string') {
                    try { return new Types.ObjectId(v); } catch { return null; }
                }
                return v;
            },
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        type: {
            type: String,
            enum: ['document', 'url', 'text', 'faq', 'pdf', 'social_report', 'crm_contact', 'crm_deal', 'inbox_thread', 'form', 'ai_memory'],
            required: true,
        },
        sourceModule: {
            type: String,
            enum: ['manual', 'copilot', 'crm', 'social', 'inbox', 'forms', 'documents'],
            default: 'manual',
        },
        content: {
            type: String,
            required: true,
        },
        metadata: {
            title: String,
            url: String,
            fileName: String,
            fileSize: Number,
            mimeType: String,
            author: String,
            tags: [String],
        },
        embedding: {
            type: [Number],
            select: false, // Don't return by default (large array)
        },
        embeddingModel: {
            type: String,
            default: 'text-embedding-ada-002',
        },
        chunks: [
            {
                content: String,
                embedding: [Number],
                startIndex: Number,
                endIndex: Number,
            },
        ],
        isActive: {
            type: Boolean,
            default: true,
        },
        createdById: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

// Indexes
KnowledgeBaseSchema.index({ type: 1 });
KnowledgeBaseSchema.index({ isActive: 1 });
KnowledgeBaseSchema.index({ brandId: 1, isActive: 1 });
KnowledgeBaseSchema.index({ brandId: 1, sourceModule: 1 });
KnowledgeBaseSchema.index({ 'metadata.tags': 1 });

const KnowledgeBase = mongoose.models.KnowledgeBase || mongoose.model<IKnowledgeBase>('KnowledgeBase', KnowledgeBaseSchema);

export default KnowledgeBase;
