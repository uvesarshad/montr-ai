import mongoose, { Schema, Document, Model, Types } from 'mongoose';

/**
 * Poll-trigger cursor (audit finding H5 — polling-trigger framework).
 *
 * One document per polling-triggered workflow. Stores the source-specific
 * "where we left off" cursor so each poll tick only emits items that are NEW
 * since the previous tick. The cursor shape is source-specific (Mixed):
 *
 *   - gmail_new_email : { lastInternalDate: string }  (epoch-ms of newest seen msg)
 *   - sheets_new_row  : { lastRowCount: number }       (header-inclusive row count)
 *   - rss_new_item    : { seenGuids: string[] (capped 200), lastPubDate?: string }
 *
 * The cursor is always saved BEFORE dispatching executions for the new items, so
 * a crash mid-dispatch loses items rather than re-delivering them (at-most-once is
 * preferred over duplicate sends for this framework — see triggers/polling/index).
 *
 * `consecutiveFailures` drives an exponential-skip backoff: after repeated fetcher
 * failures the executor skips ticks (and notifies the owner once) instead of
 * hammering a broken source. It resets to 0 on the first successful fetch.
 */
export interface IPollCursor extends Document {
  workflowId: Types.ObjectId;
  /** Discriminates which fetcher wrote the cursor (defensive — also on the workflow). */
  pollSource?: string;
  /** Source-specific cursor payload (see header). */
  cursor: unknown;
  /** Consecutive fetcher failures since the last success (drives backoff). */
  consecutiveFailures: number;
  /** Ticks to skip before retrying after a failure (exponential backoff). */
  skipsRemaining: number;
  /** Last error message recorded by a failing fetcher (for diagnostics). */
  lastError?: string | null;
  /** True once the owner has been notified about a persistently failing source. */
  ownerNotified: boolean;
  /** Last time a tick actually ran the fetcher (success OR failure). */
  lastPolledAt?: Date;
  /** Last time a fetch succeeded. */
  lastSuccessAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PollCursorSchema = new Schema<IPollCursor>(
  {
    workflowId: {
      type: Schema.Types.ObjectId,
      ref: 'UnifiedWorkflow',
      required: true,
      unique: true, // one cursor per workflow
      index: true,
    },
    pollSource: { type: String },
    cursor: { type: Schema.Types.Mixed },
    consecutiveFailures: { type: Number, default: 0 },
    skipsRemaining: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    ownerNotified: { type: Boolean, default: false },
    lastPolledAt: { type: Date },
    lastSuccessAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'poll_cursors',
  }
);

// Prevent model recompilation in development hot-reload.
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.PollCursor) {
    delete mongoose.models.PollCursor;
  }
}

export const PollCursor: Model<IPollCursor> =
  mongoose.models.PollCursor ||
  mongoose.model<IPollCursor>('PollCursor', PollCursorSchema);

export default PollCursor;
