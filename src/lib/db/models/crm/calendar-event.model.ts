import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IEventOrganizer {
  email: string;
  name?: string;
  self: boolean;
}

export interface IEventAttendee {
  email: string;
  name?: string;
  status: 'pending' | 'accepted' | 'declined' | 'tentative';
  optional: boolean;
}

export interface IEventReminder {
  method: 'email' | 'popup';
  minutes: number;
}

export interface ICrmCalendarEvent extends Document {
  accountId: Types.ObjectId;

  // Event Identifiers
  eventId: string;
  calendarId: string;
  recurringEventId?: string;
  iCalUID?: string;

  // Event Details
  title: string;
  description?: string;
  location?: string;
  meetingLink?: string;

  // Time
  startTime: Date;
  endTime: Date;
  timezone?: string;
  isAllDay: boolean;

  // Recurrence
  isRecurring: boolean;
  recurrenceRule?: string;
  recurrenceExceptions: Date[];

  // Attendees
  organizer?: IEventOrganizer;
  attendees: IEventAttendee[];

  // Status
  status: 'confirmed' | 'tentative' | 'cancelled';
  visibility: 'default' | 'public' | 'private';
  busy: 'busy' | 'free';

  // CRM Links
  contactIds: Types.ObjectId[];
  companyId?: Types.ObjectId;
  dealId?: Types.ObjectId;

  // Reminders
  reminders: IEventReminder[];

  // Sync metadata
  htmlLink?: string;
  etag?: string;
  lastSyncedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const EventOrganizerSchema = new Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
  },
  name: String,
  self: {
    type: Boolean,
    default: false,
  },
}, { _id: false });

const EventAttendeeSchema = new Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
  },
  name: String,
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'tentative'],
    default: 'pending',
  },
  optional: {
    type: Boolean,
    default: false,
  },
}, { _id: false });

const EventReminderSchema = new Schema({
  method: {
    type: String,
    enum: ['email', 'popup'],
    required: true,
  },
  minutes: {
    type: Number,
    required: true,
  },
}, { _id: false });

const CrmCalendarEventSchema = new Schema<ICrmCalendarEvent>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmCalendarAccount',
      required: true,
      index: true,
    },
    eventId: {
      type: String,
      required: true,
    },
    calendarId: {
      type: String,
      required: true,
    },
    recurringEventId: String,
    iCalUID: String,
    title: {
      type: String,
      required: true,
    },
    description: String,
    location: String,
    meetingLink: String,
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    timezone: String,
    isAllDay: {
      type: Boolean,
      default: false,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurrenceRule: String,
    recurrenceExceptions: {
      type: [Date],
      default: [],
    },
    organizer: EventOrganizerSchema,
    attendees: {
      type: [EventAttendeeSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ['confirmed', 'tentative', 'cancelled'],
      default: 'confirmed',
    },
    visibility: {
      type: String,
      enum: ['default', 'public', 'private'],
      default: 'default',
    },
    busy: {
      type: String,
      enum: ['busy', 'free'],
      default: 'busy',
    },
    contactIds: [{
      type: Schema.Types.ObjectId,
      ref: 'CrmContact',
    }],
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmCompany',
    },
    dealId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmDeal',
    },
    reminders: {
      type: [EventReminderSchema],
      default: [],
    },
    htmlLink: String,
    etag: String,
    lastSyncedAt: Date,
  },
  {
    timestamps: true,
    collection: 'crm_calendar_events',
  }
);

// Indexes
CrmCalendarEventSchema.index({ accountId: 1, eventId: 1 }, { unique: true });
CrmCalendarEventSchema.index({ startTime: 1, endTime: 1 });
CrmCalendarEventSchema.index({ contactIds: 1 });
CrmCalendarEventSchema.index({ companyId: 1 });
CrmCalendarEventSchema.index({ dealId: 1 });
CrmCalendarEventSchema.index({ 'attendees.email': 1 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmCalendarEvent) {
    delete mongoose.models.CrmCalendarEvent;
  }
}

const CrmCalendarEvent: Model<ICrmCalendarEvent> =
  mongoose.models.CrmCalendarEvent || mongoose.model<ICrmCalendarEvent>('CrmCalendarEvent', CrmCalendarEventSchema);

export default CrmCalendarEvent;
