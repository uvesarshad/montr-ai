import { Pool, PoolClient } from 'pg';

/**
 * PostgreSQL connection pool for vector embeddings (pgvector).
 * 
 * Requires: DATABASE_URL or POSTGRES_URL env var.
 * Format: postgresql://user:password@host:port/dbname
 */

let pool: Pool | null = null;

function getPool(): Pool {
    if (!pool) {
        const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

        if (!connectionString) {
            throw new Error(
                'PostgreSQL connection string not found. Set DATABASE_URL or POSTGRES_URL in your .env file.\n' +
                'Example: DATABASE_URL=postgresql://postgres:password@localhost:5432/montrai'
            );
        }

        pool = new Pool({
            connectionString,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });

        pool.on('error', (err) => {
            console.error('[PostgreSQL] Unexpected pool error:', err);
        });
    }

    return pool;
}

/**
 * Execute a query against the PostgreSQL pool.
 */
export async function pgQuery<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }> {
    const pool = getPool();
    const result = await pool.query(text, params);
    return { rows: result.rows as T[], rowCount: result.rowCount };
}

/**
 * Get a client from the pool for transactions.
 */
export async function pgClient(): Promise<PoolClient> {
    const pool = getPool();
    return pool.connect();
}

/**
 * Close the pool (for graceful shutdown).
 */
export async function pgClose(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
