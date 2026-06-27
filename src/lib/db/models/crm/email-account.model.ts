import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IOAuthCredentials {
  accessToken: string; // Should be encrypted
  refreshToken: string; // Should be encrypted
  expiresAt?: Date;
  scope?: string;
}

export interface IImapConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string; // Should be encrypted
  password: string; // Should be encrypted
}

export interface ISmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string; // Should be encrypted
  password: string; // Should be encrypted
}

export interface ICrmEmailAccount extends Document {
  userId: Types.ObjectId;
  email: string;
  displayName?: string;

  // Provider
  provider: 'gmail' | 'outlook' | 'imap';
  isActive: boolean;

  // OAuth (for Gmail/Outlook)
  oauth?: IOAuthCredentials;

  // IMAP/SMTP (for generic)
  imap?: IImapConfig;
  smtp?: ISmtpConfig;

  // Sync Settings
  syncEnabled: boolean;
  syncFolders: string[];
  syncStartDate?: Date;
  autoLinkContacts: boolean;
  autoCreateContacts: boolean;
  autoCreateCompanies: boolean;

  // Sync State
  lastSyncAt?: Date;
  lastSyncError?: string;
  syncCursor?: string; // Provider-specific cursor/token
  totalEmailsSynced: number;

  // Signature
  signature?: string; // Email signature (HTML)

  createdAt: Date;
  updatedAt: Date;
}

const OAuthCredentialsSchema = new Schema({
  accessToken: {
    type: String,
    required: true,
  },
  refreshToken: {
    type: String,
    required: true,
  },
  expiresAt: Date,
  scope: String,
}, { _id: false });

const ImapConfigSchema = new Schema({
  host: {
    type: String,
    required: true,
  },
  port: {
    type: Number,
    required: true,
  },
  secure: {
    type: Boolean,
    default: true,
  },
  username: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
}, { _id: false });

const SmtpConfigSchema = new Schema({
  host: {
    type: String,
    required: true,
  },
  port: {
    type: Number,
    required: true,
  },
  secure: {
    type: Boolean,
    default: true,
  },
  username: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
}, { _id: false });

const CrmEmailAccountSchema = new Schema<ICrmEmailAccount>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    displayName: {
      type: String,
      trim: true,
    },
    provider: {
      type: String,
      enum: ['gmail', 'outlook', 'imap'],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    oauth: OAuthCredentialsSchema,
    imap: ImapConfigSchema,
    smtp: SmtpConfigSchema,
    syncEnabled: {
      type: Boolean,
      default: true,
    },
    syncFolders: {
      type: [String],
      default: ['INBOX', 'Sent'],
    },
    syncStartDate: Date,
    autoLinkContacts: {
      type: Boolean,
      default: true,
    },
    autoCreateContacts: {
      type: Boolean,
      default: false,
    },
    autoCreateCompanies: {
      type: Boolean,
      default: false,
    },
    lastSyncAt: Date,
    lastSyncError: String,
    syncCursor: String,
    totalEmailsSynced: {
      type: Number,
      default: 0,
    },
    signature: String,
  },
  {
    timestamps: true,
    collection: 'crm_email_accounts',
  }
);

// Indexes
CrmEmailAccountSchema.index({ userId: 1 });
CrmEmailAccountSchema.index({ email: 1 }, { unique: true });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmEmailAccount) {
    delete mongoose.models.CrmEmailAccount;
  }
}

const CrmEmailAccount: Model<ICrmEmailAccount> =
  mongoose.models.CrmEmailAccount || mongoose.model<ICrmEmailAccount>('CrmEmailAccount', CrmEmailAccountSchema);

export default CrmEmailAccount;
