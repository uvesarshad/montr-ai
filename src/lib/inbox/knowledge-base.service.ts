// OSS single-tenant override of src/lib/inbox/knowledge-base.service.ts — generated CP-2 hand-patch; org-stripped, userId-scoped.
/**
 * Knowledge Base Service
 * Handles document indexing and semantic search using Gemini Embedding 2 + pgvector.
 *
 * Architecture:
 * - MongoDB (KnowledgeBase collection): stores full metadata, content, and refs
 * - PostgreSQL (knowledge_embeddings table): stores only vectors for cosine search via pgvector
 */

import KnowledgeBase from '@/lib/db/models/knowledge-base.model';
import { pgQuery } from '@/lib/db/pg-client';
import { Types } from 'mongoose';

interface SearchResult {
    id: Types.ObjectId;
    name: string;
    content: string;
    type: string;
    metadata?: Record<string, unknown>;
    similarity: number;
}

/**
 * Generate embedding using Gemini Embedding 2 API.
 * Falls back to returning null if the API key is missing (allows the system to work without vectors).
 */
async function generateGeminiEmbedding(text: string): Promise<number[] | null> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

    if (!apiKey) {
        console.warn('[KnowledgeBase] No GEMINI_API_KEY set — skipping embedding generation');
        return null;
    }

    try {
        // Truncate to Gemini's context window (max ~10k tokens ≈ 30k chars)
        const truncated = text.slice(0, 30000);

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'models/text-embedding-004',
                    content: { parts: [{ text: truncated }] },
                    taskType: 'RETRIEVAL_DOCUMENT',
                }),
            }
        );

        if (!response.ok) {
            const err = await response.text();
            console.error('[KnowledgeBase] Gemini embedding API error:', err);
            return null;
        }

        const data = await response.json();
        return data.embedding?.values || null;
    } catch (error) {
        console.error('[KnowledgeBase] Embedding generation failed:', error);
        return null;
    }
}

class KnowledgeBaseService {
    /**
     * Generate embedding for text (exposed for external use)
     */
    async generateEmbedding(text: string): Promise<number[]> {
        const embedding = await generateGeminiEmbedding(text);
        if (!embedding) throw new Error('Failed to generate embedding');
        return embedding;
    }

    /**
     * Index a document: saves to MongoDB + stores embedding in PostgreSQL pgvector
     */
    async indexDocument(params: {
        brandId?: string;
        name: string;
        content: string;
        type: string;
        sourceModule?: string;
        metadata?: Record<string, unknown>;
        createdById: Types.ObjectId;
    }): Promise<unknown> {
        try {
            // 1. Save full document to MongoDB
            const kb = await KnowledgeBase.create({
                brandId: params.brandId || null,
                name: params.name,
                content: params.content,
                type: params.type,
                sourceModule: params.sourceModule || 'manual',
                metadata: params.metadata,
                embeddingModel: 'text-embedding-004',
                createdById: params.createdById,
            });

            // 2. Generate embedding and store in PostgreSQL
            const embedding = await generateGeminiEmbedding(params.content);
            if (embedding) {
                try {
                    const vectorStr = `[${embedding.join(',')}]`;
                    // RAW-SQL EDIT (org-strip): dropped the `organization_id` column + its
                    // bound param from the INSERT; placeholders renumbered ($6::vector → $5::vector).
                    // pgvector rows are no longer tenant-partitioned in single-tenant OSS.
                    await pgQuery(
                        `INSERT INTO knowledge_embeddings
                         (brand_id, source_module, source_id, content, embedding, embedding_model, metadata)
                         VALUES ($1, $2, $3, $4, $5::vector, $6, $7)`,
                        [
                            params.brandId || null,
                            params.sourceModule || 'manual',
                            kb._id.toString(),
                            params.content.slice(0, 50000), // Safety truncation
                            vectorStr,
                            'text-embedding-004',
                            JSON.stringify({ name: params.name, type: params.type, ...params.metadata }),
                        ]
                    );
                } catch (pgError) {
                    // Log but don't fail — MongoDB still has the entry
                    console.error('[KnowledgeBase] pgvector insert failed (non-fatal):', pgError);
                }
            }

            return kb;
        } catch (error) {
            console.error('Error indexing document:', error);
            throw error;
        }
    }

    /**
     * Semantic search using pgvector cosine distance.
     * Falls back to text search in MongoDB if pgvector is not available.
     */
    async search(params: {
        brandId?: string;
        query: string;
        limit?: number;
        threshold?: number;
    }): Promise<SearchResult[]> {
        const limit = params.limit || 5;
        const threshold = params.threshold || 0.3; // Cosine distance threshold (lower = more similar)

        try {
            // Try pgvector first
            const queryEmbedding = await generateGeminiEmbedding(params.query);

            if (queryEmbedding) {
                try {
                    const vectorStr = `[${queryEmbedding.join(',')}]`;
                    // RAW-SQL EDIT (org-strip): dropped the `WHERE organization_id = $2` predicate
                    // and its bound param. Anchored the remaining conditional predicates on
                    // `WHERE 1=1` so the dynamic `$${sqlParams.length + 1}` numbering and the
                    // optional brand_id / threshold / limit appends stay byte-for-byte intact.
                    let sql = `
                        SELECT source_id, content, metadata,
                               1 - (embedding <=> $1::vector) AS similarity
                        FROM knowledge_embeddings
                        WHERE 1=1
                    `;
                    const sqlParams: (string | number)[] = [vectorStr];

                    if (params.brandId) {
                        sql += ` AND brand_id = $${sqlParams.length + 1}`;
                        sqlParams.push(params.brandId);
                    }

                    sql += ` AND 1 - (embedding <=> $1::vector) >= $${sqlParams.length + 1}`;
                    sqlParams.push(threshold);

                    sql += ` ORDER BY embedding <=> $1::vector ASC LIMIT $${sqlParams.length + 1}`;
                    sqlParams.push(limit);

                    const result = await pgQuery<{
                        source_id: string;
                        content: string;
                        metadata: Record<string, unknown>;
                        similarity: number;
                    }>(sql, sqlParams);

                    if (result.rows.length > 0) {
                        return result.rows.map(row => ({
                            id: new Types.ObjectId(row.source_id),
                            name: String(row.metadata?.name || 'Unknown'),
                            content: row.content,
                            type: String(row.metadata?.type || 'text'),
                            metadata: row.metadata,
                            similarity: row.similarity,
                        }));
                    }
                } catch (pgError) {
                    console.warn('[KnowledgeBase] pgvector search failed, falling back to MongoDB text search:', pgError);
                }
            }

            // Fallback: MongoDB text search (no embeddings needed)
            return this.fallbackTextSearch(params.brandId, params.query, limit);
        } catch (error) {
            console.error('Error searching knowledge base:', error);
            return this.fallbackTextSearch(params.brandId, params.query, limit);
        }
    }

    /**
     * Fallback: simple regex text search in MongoDB when pgvector is unavailable.
     */
    private async fallbackTextSearch(
        brandId: string | undefined,
        query: string,
        limit: number
    ): Promise<SearchResult[]> {
        const filter: Record<string, unknown> = { isActive: true };
        if (brandId) filter.brandId = brandId;

        const entries = await KnowledgeBase.find({
            ...filter,
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { content: { $regex: query, $options: 'i' } },
            ],
        })
            .select('-embedding -chunks')
            .limit(limit)
            .lean();

        return entries.map(entry => ({
            id: entry._id as Types.ObjectId,
            name: entry.name,
            content: entry.content,
            type: entry.type,
            metadata: entry.metadata,
            similarity: 0.5,
        }));
    }

    /**
     * Get relevant context for a query (used by tools and agents).
     */
    async getContext(params: {
        brandId?: string;
        query: string;
        maxTokens?: number;
    }): Promise<string> {
        try {
            const results = await this.search({
                brandId: params.brandId,
                query: params.query,
                limit: 3,
            });

            const context = results
                .map(r => `${r.name}:\n${r.content}`)
                .join('\n\n---\n\n');

            const maxChars = (params.maxTokens || 2000) * 4;
            return context.slice(0, maxChars);
        } catch (error) {
            console.error('Error getting context:', error);
            return '';
        }
    }
}

export const knowledgeBaseService = new KnowledgeBaseService();
