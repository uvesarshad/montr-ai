/**
 * Shared types for the polling-trigger framework (audit finding H5).
 *
 * A fetcher is a pure-ish function: given the workflow's poll config + the stored
 * cursor, it returns the items that are NEW since that cursor and the cursor to
 * persist for next tick. It must NOT mutate workflow state or dispatch executions
 * — the executor (index.ts) owns cursor persistence and dispatch.
 */

export interface PollFetcherInput {
  /** Trigger config (trigger.config) — source-specific fields live here. */
  config: Record<string, unknown>;
  /** The cursor stored after the previous tick (undefined on first run). */
  cursor: unknown;
  /** Workflow owner user id — used to decrypt workflow credential vault entries. */
  userId: string;
  /** Decrypted workflow credential vault (name → value), as the engine exposes it. */
  credentials: Record<string, unknown>;
}

export interface PollFetcherResult {
  /**
   * New items, OLDEST-FIRST. Each item MUST carry a stable `id` used to build the
   * execution idempotency key. Anything else is forwarded as trigger data.
   */
  newItems: Array<Record<string, unknown> & { id: string }>;
  /** Cursor to persist for the next tick. */
  nextCursor: unknown;
}

export interface PollFetcher {
  /** Stable source key (matches trigger.config.pollSource). */
  readonly source: string;
  fetch(input: PollFetcherInput): Promise<PollFetcherResult>;
}
