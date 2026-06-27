/**
 * Shared types for identity-resolver backfills (B3-1.2 / 1.3 / 1.4).
 *
 * Every backfill follows the same shape: stream rows, route the identifier
 * through `resolveContact`, repair the orphaned reference, write a summary.
 */

export interface BackfillOptions {
  /** When true, scans and reports without writing. */
  dryRun?: boolean;
  /** Maximum rows per batch; default 200. */
  batchSize?: number;
  /** Caps total rows processed. Useful for prod canaries. */
  limit?: number;
  /** Used for created `crm_contact.createdById`. Required if create-on-missing is desired. */
  createdById?: string;
  /** Set to true to create CRM contacts when the resolver finds no match. */
  createMissing?: boolean;
}

export interface BackfillReport {
  /** How many source rows were scanned. */
  scanned: number;
  /** How many rows already had a valid CRM contact reference. */
  alreadyLinked: number;
  /** How many rows had their contactId repaired (pointed at a now-resolved contact). */
  repaired: number;
  /** How many new CRM contacts were created. */
  created: number;
  /** How many rows could not be resolved or repaired (logged for manual review). */
  unresolved: number;
  /** Errors encountered (per-row, not fatal). */
  errors: Array<{ rowId: string; reason: string }>;
}
