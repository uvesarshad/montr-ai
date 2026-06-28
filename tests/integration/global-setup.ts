/**
 * Vitest GLOBAL setup for the integration suite (runs once, in the main vitest
 * process). Boots real Mongo / Postgres / Redis containers via testcontainers,
 * provisions schema, then publishes their connection strings to a temp env file
 * that each worker's `setup.ts` loads. Returns a teardown that stops everything.
 *
 * Mongo is started as a single-node replica set (`rs0`) — Mongoose/Mongo
 * multi-document transactions are only available against a replica set, so this
 * mirrors the production `docker-compose.yml` topology.
 *
 * testcontainers and its module packages are HEAVY optional dev deps; they are
 * imported dynamically so the rest of the toolchain (and `npm run test`) never
 * needs them. If they are missing we fail loudly with the install command.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ENV_FILE_PATH } from './shared';

const PG_TABLE_DDL = `
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE TABLE IF NOT EXISTS knowledge_embeddings (
        id              SERIAL PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        brand_id        VARCHAR(64),
        source_module   VARCHAR(32) DEFAULT 'manual',
        source_id       VARCHAR(64),
        content         TEXT NOT NULL,
        embedding       vector(768),
        embedding_model VARCHAR(64) DEFAULT 'gemini-embedding-002',
        metadata        JSONB DEFAULT '{}',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_embeddings_org_brand
        ON knowledge_embeddings(organization_id, brand_id);
`;

type Stoppable = { stop: () => Promise<unknown> };

async function loadTestcontainers() {
    try {
        const [{ MongoDBContainer }, { PostgreSqlContainer }, { RedisContainer }] =
            await Promise.all([
                import('@testcontainers/mongodb'),
                import('@testcontainers/postgresql'),
                import('@testcontainers/redis'),
            ]);
        return { MongoDBContainer, PostgreSqlContainer, RedisContainer };
    } catch (err) {
        throw new Error(
            '[integration] testcontainers packages are not installed. Run:\n' +
                '  npm i -D testcontainers @testcontainers/mongodb @testcontainers/postgresql @testcontainers/redis\n' +
                'and make sure Docker is running.\n\nOriginal error: ' +
                (err instanceof Error ? err.message : String(err)),
        );
    }
}

export default async function setup(): Promise<() => Promise<void>> {
    const { MongoDBContainer, PostgreSqlContainer, RedisContainer } =
        await loadTestcontainers();

    const started: Stoppable[] = [];

    // --- Mongo (single-node replica set rs0) ---
    // MongoDBContainer configures `--replSet` and initiates rs0 on start, and
    // hands back a directConnection URI usable for transactions.
    const mongo = await new MongoDBContainer('mongo:7').start();
    started.push(mongo);
    const mongoUri = mongo.getConnectionString();

    // --- Postgres with pgvector ---
    const pg = await new PostgreSqlContainer('pgvector/pgvector:pg16')
        .withDatabase('montrai_test')
        .withUsername('postgres')
        .withPassword('password')
        .start();
    started.push(pg);
    const pgUri = pg.getConnectionUri();

    // --- Redis ---
    const redis = await new RedisContainer('redis:7').start();
    started.push(redis);
    const redisUri = redis.getConnectionUrl();

    // Provision pgvector extension + table once, up front.
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: pgUri });
    try {
        await pool.query(PG_TABLE_DDL);
    } finally {
        await pool.end();
    }

    // Publish connection strings to a temp env file the workers read in setup.ts.
    // (vitest globalSetup runs in a different process than the test workers, so
    // setting process.env here alone would not reach them.)
    const dir = mkdtempSync(path.join(tmpdir(), 'montrai-it-'));
    const env = {
        MONGODB_URI: mongoUri,
        MONGODB_DB_NAME: 'montrai_test',
        DATABASE_URL: pgUri,
        REDIS_URL: redisUri,
    };
    writeFileSync(ENV_FILE_PATH, JSON.stringify(env), 'utf8');
    // Also set in-process (helps any same-process consumers / debugging).
    Object.assign(process.env, env);

    // eslint-disable-next-line no-console
    console.log('[integration] containers ready:', {
        mongo: mongoUri.replace(/\/\/.*@/, '//***@'),
        postgres: pgUri.replace(/\/\/.*@/, '//***@'),
        redis: redisUri.replace(/\/\/.*@/, '//***@'),
    });

    return async function teardown() {
        try {
            rmSync(ENV_FILE_PATH, { force: true });
            rmSync(dir, { recursive: true, force: true });
        } catch {
            /* best-effort */
        }
        await Promise.allSettled(started.map((c) => c.stop()));
    };
}
