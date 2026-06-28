/**
 * pgvector semantic-search round-trip vs REAL Postgres (pgvector/pgvector:pg16).
 *
 * Drives the exact INSERT + cosine-distance SELECT used by
 * `src/lib/inbox/knowledge-base.service.ts` through the real `pgQuery` client
 * (no embedding API needed — we supply deterministic 768-dim vectors). Verifies:
 *   1. cosine ranking (closest vector first), and
 *   2. organization scoping (org B rows never surface in an org A search).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgQuery, pgClose } from '@/lib/db/pg-client';
import { vectorLiteral } from './shared';

const ORG_A = 'org-aaaaaaaaaaaaaaaaaaaaaa';
const ORG_B = 'org-bbbbbbbbbbbbbbbbbbbbbb';

beforeAll(async () => {
    await pgQuery('DELETE FROM knowledge_embeddings WHERE organization_id = ANY($1)', [
        [ORG_A, ORG_B],
    ]);

    // Two org-A docs + one org-B doc. Query vector ≈ [1,0,...]; docA1 is the
    // closest, docA2 orthogonal, docB identical to docA1 but in another org.
    const rows: Array<[string, string, string]> = [
        [ORG_A, 'a-1', vectorLiteral(1, 0)],
        [ORG_A, 'a-2', vectorLiteral(0, 1)],
        [ORG_B, 'b-1', vectorLiteral(1, 0)],
    ];
    for (const [org, sourceId, vec] of rows) {
        await pgQuery(
            `INSERT INTO knowledge_embeddings
             (organization_id, brand_id, source_module, source_id, content, embedding, embedding_model, metadata)
             VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8)`,
            [
                org,
                null,
                'manual',
                sourceId,
                `content for ${sourceId}`,
                vec,
                'text-embedding-004',
                JSON.stringify({ name: sourceId, type: 'text' }),
            ],
        );
    }
});

afterAll(async () => {
    await pgQuery('DELETE FROM knowledge_embeddings WHERE organization_id = ANY($1)', [
        [ORG_A, ORG_B],
    ]);
    await pgClose();
});

describe('knowledge_embeddings pgvector search (real Postgres)', () => {
    it('ranks by cosine similarity within the queried org only', async () => {
        const queryVec = vectorLiteral(1, 0);
        const { rows } = await pgQuery<{
            source_id: string;
            similarity: number;
        }>(
            `SELECT source_id, 1 - (embedding <=> $1::vector) AS similarity
             FROM knowledge_embeddings
             WHERE organization_id = $2
             ORDER BY embedding <=> $1::vector ASC`,
            [queryVec, ORG_A],
        );

        const ids = rows.map((r) => r.source_id);
        // Only org-A rows, B never leaks in.
        expect(ids).toContain('a-1');
        expect(ids).toContain('a-2');
        expect(ids).not.toContain('b-1');

        // Closest vector ranks first; its similarity ≈ 1.
        expect(ids[0]).toBe('a-1');
        expect(Number(rows[0].similarity)).toBeGreaterThan(0.99);
        // Orthogonal vector is far less similar.
        const a2 = rows.find((r) => r.source_id === 'a-2')!;
        expect(Number(a2.similarity)).toBeLessThan(0.5);
    });

    it('applies a similarity threshold like the service does', async () => {
        const queryVec = vectorLiteral(1, 0);
        const { rows } = await pgQuery<{ source_id: string }>(
            `SELECT source_id
             FROM knowledge_embeddings
             WHERE organization_id = $2
               AND 1 - (embedding <=> $1::vector) >= $3
             ORDER BY embedding <=> $1::vector ASC`,
            [queryVec, ORG_A, 0.5],
        );
        const ids = rows.map((r) => r.source_id);
        expect(ids).toEqual(['a-1']); // a-2 filtered out by threshold
    });
});
