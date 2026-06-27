import mongoose, { Schema, Document, Model, Types } from 'mongoose';

// Activity types enum
export type ActivityType =
  | 'note'
  | 'task'
  | 'call'
  | 'meeting'
  | 'email'
  | 'email_sent'
  | 'message'
  | 'calendar_event'
  | 'deal_created'
  | 'deal_stage_changed'
  | 'deal_won'
  | 'deal_lost'
  | 'contact_created'
  | 'form_submission'
  | 'workflow_triggered';

export interface IAttendee {
  email: string;
  name?: string;
  status: 'pending' | 'accepted' | 'declined';
}

export interface IEmailMetadata {
  messageId?: string;
  threadId?: string;
  accountId?: Types.ObjectId;
  from?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
  hasAttachments?: boolean;
}

export interface IMessageMetadata {
  channel?: 'whatsapp' | 'instagram' | 'facebook' | 'twitter' | 'sms';
  externalId?: string;
  direction?: 'inbound' | 'outbound';
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  campaignId?: Types.ObjectId;
  mediaUrls?: string[]; // URLs of media files (images, documents, videos)
  mediaType?: 'image' | 'video' | 'audio' | 'document'; // Type of media
  mediaIds?: string[]; // Meta media IDs
}

export interface ICalendarMetadata {
  eventId?: string;
  accountId?: Types.ObjectId;
  calendarId?: string;
  recurringEventId?: string;
  htmlLink?: string;
}

export interface ICrmActivity extends Document {
  // Activity Type
  type: ActivityType;
  subtype?: string;

  // Polymorphic Target
  targetType: 'contact' | 'company' | 'deal';
  targetId: Types.ObjectId;

  // Additional Links
  contactId?: Types.ObjectId;
  companyId?: Types.ObjectId;
  dealId?: Types.ObjectId;

  // Content (Rich Text)
  subject?: string;
  body?: string; // TipTap JSON content
  bodyPlain?: string; // Plain text for search

  // For Tasks
  dueDate?: Date;
  reminderAt?: Date;
  priority?: 'low' | 'medium' | 'high';
  completed: boolean;
  completedAt?: Date;
  completedById?: Types.ObjectId;

  // For Meetings/Calls
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  location?: string;
  meetingLink?: string;
  attendees: IAttendee[];
  outcome?: string;

  // For Emails (synced)
  emailMetadata?: IEmailMetadata;

  // For Messages (Omnichat)
  messageMetadata?: IMessageMetadata;

  // For Calendar Events (synced)
  calendarMetadata?: ICalendarMetadata;

  // Visibility
  isPrivate: boolean;
  isPinned: boolean;

  // Assignment
  assignedTo?: Types.ObjectId;
  createdById: Types.ObjectId;

  // Soft delete (trash & restore)
  deletedAt?: Date;
  deletedById?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

const AttendeeSchema = new Schema({
  email: {
    type: String,
    required: true,
  },
  name: String,
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined'],
    default: 'pending',
  },
}, { _id: false });

const EmailMetadataSchema = new Schema({
  messageId: String,
  threadId: String,
  accountId: {
    type: Schema.Types.ObjectId,
    ref: 'CrmEmailAccount',
  },
  from: String,
  to: [String],
  cc: [String],
  bcc: [String],
  replyTo: String,
  inReplyTo: String,
  references: [String],
  hasAttachments: Boolean,
}, { _id: false });

const MessageMetadataSchema = new Schema({
  channel: {
    type: String,
    enum: ['whatsapp', 'instagram', 'facebook', 'twitter', 'sms'],
  },
  externalId: String,
  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
  },
  campaignId: Schema.Types.ObjectId,
}, { _id: false });

const CalendarMetadataSchema = new Schema({
  eventId: String,
  accountId: {
    type: Schema.Types.ObjectId,
    ref: 'CrmCalendarAccount',
  },
  calendarId: String,
  recurringEventId: String,
  htmlLink: String,
}, { _id: false });

const CrmActivitySchema = new Schema<ICrmActivity>(
  {
    type: {
      type: String,
      enum: [
        'note', 'task', 'call', 'meeting', 'email', 'email_sent', 'message',
        'calendar_event', 'deal_created', 'deal_stage_changed', 'deal_won',
        'deal_lost', 'contact_created', 'form_submission', 'workflow_triggered'
      ],
      required: true,
    },
    subtype: String,
    targetType: {
      type: String,
      enum: ['contact', 'company', 'deal'],
      required: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
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
    subject: {
      type: String,
      trim: true,
    },
    body: String,
    bodyPlain: String,
    dueDate: Date,
    reminderAt: Date,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
    },
    completed: {
      type: Boolean,
      default: false,
    },
    completedAt: Date,
    completedById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    startTime: Date,
    endTime: Date,
    duration: Number,
    location: String,
    meetingLink: String,
    attendees: {
      type: [AttendeeSchema],
      default: [],
    },
    outcome: String,
    emailMetadata: EmailMetadataSchema,
    messageMetadata: MessageMetadataSchema,
    calendarMetadata: CalendarMetadataSchema,
    isPrivate: {
      type: Boolean,
      default: false,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    deletedAt: {
      type: Date,
      default: undefined,
    },
    deletedById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    createdById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'crm_activities',
  }
);

// Org-scoped trash queries — only indexes soft-deleted rows.
CrmActivitySchema.index(
  { deletedAt: 1 },
  { partialFilterExpression: { deletedAt: { $exists: true } } }
);

// Indexes
CrmActivitySchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
CrmActivitySchema.index({ type: 1, createdAt: -1 });
CrmActivitySchema.index({ contactId: 1, createdAt: -1 });
CrmActivitySchema.index({ companyId: 1, createdAt: -1 });
CrmActivitySchema.index({ dealId: 1, createdAt: -1 });
CrmActivitySchema.index({ assignedTo: 1, completed: 1, dueDate: 1 });
CrmActivitySchema.index({ createdById: 1, createdAt: -1 });
CrmActivitySchema.index({ 'emailMetadata.threadId': 1 }, { sparse: true });

// Text index for search
CrmActivitySchema.index(
  { subject: 'text', bodyPlain: 'text' },
  { name: 'activity_text_search' }
);

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmActivity) {
    delete mongoose.models.CrmActivity;
  }
}

const CrmActivity: Model<ICrmActivity> =
  mongoose.models.CrmActivity || mongoose.model<ICrmActivity>('CrmActivity', CrmActivitySchema);

export default CrmActivity;
