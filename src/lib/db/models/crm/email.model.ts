import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IEmailAddress {
  email: string;
  name?: string;
}

export interface IEmailAttachment {
  attachmentId?: Types.ObjectId;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface IEmailTracking {
  opens: number;
  lastOpenedAt?: Date;
  clicks: {
    url: string;
    count: number;
    lastClickedAt?: Date;
  }[];
}

export interface ICrmEmail extends Document {
  accountId: Types.ObjectId;

  // Email Identifiers
  messageId: string;
  threadId?: string;
  conversationId?: Types.ObjectId;

  // Addresses
  from: IEmailAddress;
  to: IEmailAddress[];
  cc: IEmailAddress[];
  replyTo?: string;
  inReplyTo?: string;
  references: string[];

  // Content
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  snippet?: string;

  // Metadata
  date: Date;
  receivedAt: Date;
  folder: 'inbox' | 'sent' | 'drafts' | 'trash' | 'archive' | string;
  labels: string[];

  // Status
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  isDraft: boolean;

  // CRM Links (auto or manual)
  contactId?: Types.ObjectId;
  companyId?: Types.ObjectId;
  dealId?: Types.ObjectId;
  isLinked: boolean;

  // Direction
  direction: 'inbound' | 'outbound';

  // Attachments
  attachments: IEmailAttachment[];
  hasAttachments: boolean;

  // Tracking (for sent emails)
  tracking?: IEmailTracking;

  createdAt: Date;
  updatedAt: Date;
}

const EmailAddressSchema = new Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
  },
  name: String,
}, { _id: false });

const EmailAttachmentSchema = new Schema({
  attachmentId: {
    type: Schema.Types.ObjectId,
    ref: 'CrmAttachment',
  },
  fileName: {
    type: String,
    required: true,
  },
  mimeType: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    required: true,
  },
}, { _id: false });

const EmailTrackingClickSchema = new Schema({
  url: {
    type: String,
    required: true,
  },
  count: {
    type: Number,
    default: 0,
  },
  lastClickedAt: Date,
}, { _id: false });

const EmailTrackingSchema = new Schema({
  opens: {
    type: Number,
    default: 0,
  },
  lastOpenedAt: Date,
  clicks: {
    type: [EmailTrackingClickSchema],
    default: [],
  },
}, { _id: false });

const CrmEmailSchema = new Schema<ICrmEmail>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmEmailAccount',
      required: true,
      index: true,
    },
    messageId: {
      type: String,
      required: true,
    },
    threadId: String,
    conversationId: Schema.Types.ObjectId,
    from: {
      type: EmailAddressSchema,
      required: true,
    },
    to: {
      type: [EmailAddressSchema],
      default: [],
    },
    cc: {
      type: [EmailAddressSchema],
      default: [],
    },
    replyTo: String,
    inReplyTo: String,
    references: {
      type: [String],
      default: [],
    },
    subject: String,
    bodyHtml: String,
    bodyText: String,
    snippet: String,
    date: {
      type: Date,
      required: true,
    },
    receivedAt: {
      type: Date,
      default: () => new Date(),
    },
    folder: {
      type: String,
      default: 'inbox',
    },
    labels: {
      type: [String],
      default: [],
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    isStarred: {
      type: Boolean,
      default: false,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    isDraft: {
      type: Boolean,
      default: false,
    },
    contactId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmContact',
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmCompany',
    },
    dealId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmDeal',
    },
    isLinked: {
      type: Boolean,
      default: false,
    },
    direction: {
      type: String,
      enum: ['inbound', 'outbound'],
      required: true,
    },
    attachments: {
      type: [EmailAttachmentSchema],
      default: [],
    },
    hasAttachments: {
      type: Boolean,
      default: false,
    },
    tracking: EmailTrackingSchema,
  },
  {
    timestamps: true,
    collection: 'crm_emails',
  }
);

// Indexes
CrmEmailSchema.index({ accountId: 1, messageId: 1 }, { unique: true });
CrmEmailSchema.index({ threadId: 1, date: -1 });
CrmEmailSchema.index({ contactId: 1, date: -1 });
CrmEmailSchema.index({ companyId: 1, date: -1 });
CrmEmailSchema.index({ dealId: 1, date: -1 });
CrmEmailSchema.index({ 'from.email': 1 });
CrmEmailSchema.index({ 'to.email': 1 });
CrmEmailSchema.index({ folder: 1, date: -1 });

// Text index for search
CrmEmailSchema.index(
  { subject: 'text', bodyText: 'text' },
  { name: 'email_text_search' }
);

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmEmail) {
    delete mongoose.models.CrmEmail;
  }
}

const CrmEmail: Model<ICrmEmail> =
  mongoose.models.CrmEmail || mongoose.model<ICrmEmail>('CrmEmail', CrmEmailSchema);

export default CrmEmail;
