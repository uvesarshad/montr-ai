/**
 * Shared constants/helpers for the integration harness.
 *
 * The env-file path is a STABLE, well-known location (not a random temp dir) so
 * that both the main-process `global-setup.ts` (which writes it) and each test
 * worker's `setup.ts` (which reads it) agree on the path without any IPC.
 */
import { tmpdir } from 'node:os';
import path from 'node:path';

export const ENV_FILE_PATH = path.join(tmpdir(), 'montrai-integration-env.json');

/** Make a deterministic 768-dim pgvector literal: `[c0,c1,0,0,...]`. */
export function vectorLiteral(c0: number, c1: number, dims = 768): string {
    const arr = new Array(dims).fill(0);
    arr[0] = c0;
    arr[1] = c1;
    return `[${arr.join(',')}]`;
}
