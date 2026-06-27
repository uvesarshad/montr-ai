import mongoose, { Schema, Document, Model, Types } from 'mongoose';

/**
 * Email sender blocklist. Each pattern is a lowercased full email
 * (`spammer@evil.com`) or a domain pattern (`@evil.com`). The email-sync
 * pipeline consults this list before auto-linking / auto-creating contacts:
 * a blocked sender's mail is still stored but never linked or used to create a
 * contact/company.
 */
export interface ICrmBlocklist extends Document {
  pattern: string; // lowercased email or '@domain.com'
  reason?: string;
  createdById: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CrmBlocklistSchema = new Schema<ICrmBlocklist>(
  {
    pattern: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    createdById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'crm_blocklist',
  }
);

// One pattern per org.
CrmBlocklistSchema.index({ pattern: 1 }, { unique: true });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmBlocklist) {
    delete mongoose.models.CrmBlocklist;
  }
}

const CrmBlocklist: Model<ICrmBlocklist> =
  mongoose.models.CrmBlocklist ||
  mongoose.model<ICrmBlocklist>('CrmBlocklist', CrmBlocklistSchema);

export default CrmBlocklist;
