import mongoose, { FilterQuery, Types } from 'mongoose';
import CrmCalendarEvent, { ICrmCalendarEvent, IEventOrganizer, IEventAttendee, IEventReminder } from '../../models/crm/calendar-event.model';

export interface CreateCalendarEventDto {
  accountId: string;
  eventId: string;
  calendarId: string;
  recurringEventId?: string;
  iCalUID?: string;
  title: string;
  description?: string;
  location?: string;
  meetingLink?: string;
  startTime: Date;
  endTime: Date;
  timezone?: string;
  isAllDay?: boolean;
  isRecurring?: boolean;
  recurrenceRule?: string;
  recurrenceExceptions?: Date[];
  organizer?: IEventOrganizer;
  attendees?: IEventAttendee[];
  status?: 'confirmed' | 'tentative' | 'cancelled';
  visibility?: 'default' | 'public' | 'private';
  busy?: 'busy' | 'free';
  contactIds?: string[];
  companyId?: string;
  dealId?: string;
  reminders?: IEventReminder[];
  htmlLink?: string;
  etag?: string;
}

export interface UpdateCalendarEventDto {
  title?: string;
  description?: string;
  location?: string;
  meetingLink?: string;
  startTime?: Date;
  endTime?: Date;
  timezone?: string;
  isAllDay?: boolean;
  recurrenceRule?: string;
  recurrenceExceptions?: Date[];
  attendees?: IEventAttendee[];
  status?: 'confirmed' | 'tentative' | 'cancelled';
  visibility?: 'default' | 'public' | 'private';
  busy?: 'busy' | 'free';
  contactIds?: string[];
  companyId?: string | null;
  dealId?: string | null;
  reminders?: IEventReminder[];
  htmlLink?: string;
  etag?: string;
  lastSyncedAt?: Date;
}

export interface CalendarEventFilters {
  accountId?: string;
  calendarId?: string;
  contactIds?: string[];
  companyId?: string;
  dealId?: string;
  startAfter?: Date;
  startBefore?: Date;
  status?: 'confirmed' | 'tentative' | 'cancelled';
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sort?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export class CalendarEventRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findById(id: string): Promise<ICrmCalendarEvent | null> {
    await this.ensureConnection();
    return CrmCalendarEvent.findOne({ _id: id }).exec();
  }

  async findByEventId(
    accountId: string,
    eventId: string
  ): Promise<ICrmCalendarEvent | null> {
    await this.ensureConnection();
    return CrmCalendarEvent.findOne({
      accountId: new Types.ObjectId(accountId),
      eventId,
    }).exec();
  }

  async find(
    filters: CalendarEventFilters = {},
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmCalendarEvent>> {
    await this.ensureConnection();

    const { page = 1, limit = 25, sort = 'startTime', sortDirection = 'asc' } = options;
    const skip = (page - 1) * limit;

    const query: FilterQuery<ICrmCalendarEvent> = { };

    if (filters.accountId) {
      query.accountId = new Types.ObjectId(filters.accountId);
    }
    if (filters.calendarId) {
      query.calendarId = filters.calendarId;
    }
    if (filters.contactIds && filters.contactIds.length > 0) {
      query.contactIds = { $in: filters.contactIds.map(id => new Types.ObjectId(id)) };
    }
    if (filters.companyId) {
      query.companyId = new Types.ObjectId(filters.companyId);
    }
    if (filters.dealId) {
      query.dealId = new Types.ObjectId(filters.dealId);
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.startAfter || filters.startBefore) {
      query.startTime = {};
      if (filters.startAfter) query.startTime.$gte = filters.startAfter;
      if (filters.startBefore) query.startTime.$lte = filters.startBefore;
    }

    const sortObj: Record<string, 1 | -1> = { [sort]: sortDirection === 'asc' ? 1 : -1 };

    const [data, total] = await Promise.all([
      CrmCalendarEvent.find(query).sort(sortObj).skip(skip).limit(limit).exec(),
      CrmCalendarEvent.countDocuments(query).exec(),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }

  async findByDateRange(
    startDate: Date,
    endDate: Date,
    accountId?: string
  ): Promise<ICrmCalendarEvent[]> {
    await this.ensureConnection();

    const query: FilterQuery<ICrmCalendarEvent> = {
      $or: [
        { startTime: { $gte: startDate, $lte: endDate } },
        { endTime: { $gte: startDate, $lte: endDate } },
        { startTime: { $lte: startDate }, endTime: { $gte: endDate } },
      ],
    };

    if (accountId) {
      query.accountId = new Types.ObjectId(accountId);
    }

    return CrmCalendarEvent.find(query).sort({ startTime: 1 }).exec();
  }

  async create(data: CreateCalendarEventDto): Promise<ICrmCalendarEvent> {
    await this.ensureConnection();

    const event = new CrmCalendarEvent({
      accountId: new Types.ObjectId(data.accountId),
      eventId: data.eventId,
      calendarId: data.calendarId,
      recurringEventId: data.recurringEventId,
      iCalUID: data.iCalUID,
      title: data.title,
      description: data.description,
      location: data.location,
      meetingLink: data.meetingLink,
      startTime: data.startTime,
      endTime: data.endTime,
      timezone: data.timezone,
      isAllDay: data.isAllDay ?? false,
      isRecurring: data.isRecurring ?? false,
      recurrenceRule: data.recurrenceRule,
      recurrenceExceptions: data.recurrenceExceptions || [],
      organizer: data.organizer,
      attendees: data.attendees || [],
      status: data.status || 'confirmed',
      visibility: data.visibility || 'default',
      busy: data.busy || 'busy',
      contactIds: data.contactIds?.map(id => new Types.ObjectId(id)) || [],
      companyId: data.companyId ? new Types.ObjectId(data.companyId) : undefined,
      dealId: data.dealId ? new Types.ObjectId(data.dealId) : undefined,
      reminders: data.reminders || [],
      htmlLink: data.htmlLink,
      etag: data.etag,
      lastSyncedAt: new Date(),
    });

    return event.save();
  }

  async update(
    id: string,
    data: UpdateCalendarEventDto
  ): Promise<ICrmCalendarEvent | null> {
    await this.ensureConnection();

    const updateData: Record<string, unknown> = { ...data };

    if (data.contactIds) {
      updateData.contactIds = data.contactIds.map(id => new Types.ObjectId(id));
    }
    if (data.companyId !== undefined) {
      updateData.companyId = data.companyId ? new Types.ObjectId(data.companyId) : null;
    }
    if (data.dealId !== undefined) {
      updateData.dealId = data.dealId ? new Types.ObjectId(data.dealId) : null;
    }

    return CrmCalendarEvent.findOneAndUpdate(
      { _id: id },
      { $set: updateData },
      { new: true }
    ).exec();
  }

  async upsertByEventId(
    accountId: string,
    eventId: string,
    data: Omit<CreateCalendarEventDto, 'accountId' | 'eventId'>
  ): Promise<ICrmCalendarEvent> {
    await this.ensureConnection();

    const existing = await this.findByEventId(accountId, eventId);
    if (existing) {
      const updated = await this.update(existing._id.toString(), {
        ...data,
        lastSyncedAt: new Date(),
      });
      return updated!;
    }

    return this.create({
      accountId,
      eventId,
      ...data,
    });
  }

  async linkToEntity(
    id: string,
    links: { contactIds?: string[]; companyId?: string; dealId?: string }
  ): Promise<ICrmCalendarEvent | null> {
    await this.ensureConnection();

    const update: Record<string, unknown> = {};
    if (links.contactIds) {
      update.contactIds = links.contactIds.map(id => new Types.ObjectId(id));
    }
    if (links.companyId) {
      update.companyId = new Types.ObjectId(links.companyId);
    }
    if (links.dealId) {
      update.dealId = new Types.ObjectId(links.dealId);
    }

    return CrmCalendarEvent.findOneAndUpdate(
      { _id: id },
      { $set: update },
      { new: true }
    ).exec();
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmCalendarEvent.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }

  async deleteByEventId(
    accountId: string,
    eventId: string
  ): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmCalendarEvent.deleteOne({
      accountId: new Types.ObjectId(accountId),
      eventId,
    }).exec();
    return result.deletedCount > 0;
  }

  async countByAccount(accountId: string): Promise<number> {
    await this.ensureConnection();
    return CrmCalendarEvent.countDocuments({
      accountId: new Types.ObjectId(accountId),
    }).exec();
  }

  async countUpcoming(days: number = 7): Promise<number> {
    await this.ensureConnection();
    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return CrmCalendarEvent.countDocuments({
      startTime: { $gte: now, $lte: future },
      status: { $ne: 'cancelled' },
    }).exec();
  }
}

export const calendarEventRepository = new CalendarEventRepository();
