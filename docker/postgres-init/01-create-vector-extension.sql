-- Runs once, on first init of an empty Postgres data directory
-- (docker-entrypoint-initdb.d). Enables pgvector. The pgvector/pgvector image
-- already ships the extension files; this just registers it in the `montrai`
-- database. src/lib/db/pg-client.ts throws hard if Postgres is unreachable, and
-- any embeddings/brand-memory/RAG path needs the `vector` type to exist.
CREATE EXTENSION IF NOT EXISTS vector;
