/**
 * pgvector Setup Script
 * Run this once to set up the pgvector extension and knowledge_embeddings table.
 * 
 * Usage: npx tsx scripts/setup-pgvector.ts
 * 
 * Prerequisites:
 *   1. PostgreSQL installed with pgvector extension
 *   2. DATABASE_URL env var set
 *   
 * To install pgvector on Windows:
 *   - Download from: https://github.com/pgvector/pgvector/releases
 *   - Copy the DLL to your PostgreSQL lib directory
 *   - Copy the SQL files to your PostgreSQL share/extension directory
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { Pool } from 'pg';

async function setup() {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

    if (!connectionString) {
        console.error('❌ DATABASE_URL or POSTGRES_URL not set in .env');
        console.log('   Example: DATABASE_URL=postgresql://postgres:password@localhost:5432/montrai');
        process.exit(1);
    }

    const pool = new Pool({ connectionString });

    try {
        console.log('🔌 Connecting to PostgreSQL...');
        const client = await pool.connect();

        // 1. Enable pgvector extension
        console.log('📦 Enabling pgvector extension...');
        await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
        console.log('   ✅ pgvector extension enabled');

        // 2. Create knowledge_embeddings table
        // Gemini Embedding 2 produces 768-dimensional vectors
        console.log('📋 Creating knowledge_embeddings table...');
        await client.query(`
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
        `);
        console.log('   ✅ knowledge_embeddings table created');

        // 3. Create indexes
        console.log('🔑 Creating indexes...');
        
        // IVFFlat index for fast cosine similarity search
        // This needs data in the table first for optimal configuration.
        // For now, create an HNSW index which works without pre-existing data.
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_embeddings_org_brand 
            ON knowledge_embeddings(organization_id, brand_id);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_embeddings_source 
            ON knowledge_embeddings(source_module, source_id);
        `);

        // HNSW index for vector similarity search (works with empty tables)
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_embeddings_vector_hnsw
            ON knowledge_embeddings 
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64);
        `);

        console.log('   ✅ Indexes created');

        // 4. Verify
        const result = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'knowledge_embeddings'
            ORDER BY ordinal_position;
        `);
        console.log('\n📊 Table schema:');
        result.rows.forEach(row => {
            console.log(`   ${row.column_name}: ${row.data_type}`);
        });

        client.release();
        console.log('\n✅ pgvector setup complete!\n');
    } catch (error: any) {
        console.error('\n❌ Setup failed:', error.message);
        if (error.message.includes('could not open extension control file')) {
            console.log('\n💡 pgvector extension not installed. Install it first:');
            console.log('   Windows: Download from https://github.com/pgvector/pgvector/releases');
            console.log('   Linux:   sudo apt install postgresql-16-pgvector');
            console.log('   Mac:     brew install pgvector');
        }
        process.exit(1);
    } finally {
        await pool.end();
    }
}

setup();
