import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface ICalendarOAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt?: Date;
  scope?: string;
}

export interface ICalendarInfo {
  calendarId: string;
  name: string;
  color?: string;
  isPrimary: boolean;
  syncEnabled: boolean;
  accessRole: 'owner' | 'writer' | 'reader';
}

export interface ICrmCalendarAccount extends Document {
  userId: Types.ObjectId;
  email: string;
  displayName?: string;

  // Provider
  provider: 'google' | 'outlook';
  isActive: boolean;

  // OAuth
  oauth?: ICalendarOAuthCredentials;

  // Calendars to sync
  calendars: ICalendarInfo[];

  // Sync Settings
  syncEnabled: boolean;
  syncDirection: 'one_way' | 'two_way';
  syncStartDate?: Date;
  autoLinkContacts: boolean;

  // Sync State
  lastSyncAt?: Date;
  lastSyncError?: string;
  syncToken?: string;

  createdAt: Date;
  updatedAt: Date;
}

const CalendarOAuthCredentialsSchema = new Schema({
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

const CalendarInfoSchema = new Schema({
  calendarId: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  color: String,
  isPrimary: {
    type: Boolean,
    default: false,
  },
  syncEnabled: {
    type: Boolean,
    default: true,
  },
  accessRole: {
    type: String,
    enum: ['owner', 'writer', 'reader'],
    default: 'owner',
  },
}, { _id: false });

const CrmCalendarAccountSchema = new Schema<ICrmCalendarAccount>(
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
      enum: ['google', 'outlook'],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    oauth: CalendarOAuthCredentialsSchema,
    calendars: {
      type: [CalendarInfoSchema],
      default: [],
    },
    syncEnabled: {
      type: Boolean,
      default: true,
    },
    syncDirection: {
      type: String,
      enum: ['one_way', 'two_way'],
      default: 'two_way',
    },
    syncStartDate: Date,
    autoLinkContacts: {
      type: Boolean,
      default: true,
    },
    lastSyncAt: Date,
    lastSyncError: String,
    syncToken: String,
  },
  {
    timestamps: true,
    collection: 'crm_calendar_accounts',
  }
);

// Indexes
CrmCalendarAccountSchema.index({ userId: 1 });
CrmCalendarAccountSchema.index({ email: 1, provider: 1 }, { unique: true });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmCalendarAccount) {
    delete mongoose.models.CrmCalendarAccount;
  }
}

const CrmCalendarAccount: Model<ICrmCalendarAccount> =
  mongoose.models.CrmCalendarAccount || mongoose.model<ICrmCalendarAccount>('CrmCalendarAccount', CrmCalendarAccountSchema);

export default CrmCalendarAccount;
