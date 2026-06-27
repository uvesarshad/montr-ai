import mongoose, { Types } from 'mongoose';
import CrmCalendarAccount, { ICrmCalendarAccount, ICalendarOAuthCredentials, ICalendarInfo } from '../../models/crm/calendar-account.model';

export interface CreateCalendarAccountDto {
  userId: string;
  email: string;
  displayName?: string;
  provider: 'google' | 'outlook';
  oauth: ICalendarOAuthCredentials;
  calendars?: ICalendarInfo[];
  syncDirection?: 'one_way' | 'two_way';
  syncStartDate?: Date;
  autoLinkContacts?: boolean;
}

export interface UpdateCalendarAccountDto {
  displayName?: string;
  oauth?: ICalendarOAuthCredentials;
  calendars?: ICalendarInfo[];
  syncEnabled?: boolean;
  syncDirection?: 'one_way' | 'two_way';
  syncStartDate?: Date;
  autoLinkContacts?: boolean;
  isActive?: boolean;
}

export class CalendarAccountRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findById(id: string): Promise<ICrmCalendarAccount | null> {
    await this.ensureConnection();
    return CrmCalendarAccount.findOne({ _id: id }).exec();
  }

  async findByUser(userId: string): Promise<ICrmCalendarAccount[]> {
    await this.ensureConnection();
    return CrmCalendarAccount.find({
      userId: new Types.ObjectId(userId),
    }).exec();
  }

  async findByEmail(email: string): Promise<ICrmCalendarAccount | null> {
    await this.ensureConnection();
    return CrmCalendarAccount.findOne({
      email: email.toLowerCase(),
    }).exec();
  }

  async findActiveForSync(): Promise<ICrmCalendarAccount[]> {
    await this.ensureConnection();
    return CrmCalendarAccount.find({
      isActive: true,
      syncEnabled: true,
    }).exec();
  }

  async create(data: CreateCalendarAccountDto): Promise<ICrmCalendarAccount> {
    await this.ensureConnection();

    const account = new CrmCalendarAccount({
      userId: new Types.ObjectId(data.userId),
      email: data.email.toLowerCase(),
      displayName: data.displayName,
      provider: data.provider,
      isActive: true,
      oauth: data.oauth,
      calendars: data.calendars || [],
      syncEnabled: true,
      syncDirection: data.syncDirection || 'one_way',
      syncStartDate: data.syncStartDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      autoLinkContacts: data.autoLinkContacts ?? true,
    });

    return account.save();
  }

  async update(
    id: string,
    data: UpdateCalendarAccountDto
  ): Promise<ICrmCalendarAccount | null> {
    await this.ensureConnection();
    return CrmCalendarAccount.findOneAndUpdate(
      { _id: id },
      { $set: data },
      { new: true }
    ).exec();
  }

  async updateOAuth(
    id: string,
    oauth: ICalendarOAuthCredentials
  ): Promise<ICrmCalendarAccount | null> {
    await this.ensureConnection();
    return CrmCalendarAccount.findOneAndUpdate(
      { _id: id },
      { $set: { oauth } },
      { new: true }
    ).exec();
  }

  async updateCalendars(
    id: string,
    calendars: ICalendarInfo[]
  ): Promise<ICrmCalendarAccount | null> {
    await this.ensureConnection();
    return CrmCalendarAccount.findOneAndUpdate(
      { _id: id },
      { $set: { calendars } },
      { new: true }
    ).exec();
  }

  async updateSyncState(
    id: string,
    state: {
      lastSyncAt?: Date;
      lastSyncError?: string;
      syncToken?: string;
    }
  ): Promise<void> {
    await this.ensureConnection();
    await CrmCalendarAccount.updateOne(
      { _id: id },
      { $set: state }
    ).exec();
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmCalendarAccount.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }

  async countByOrganization(): Promise<number> {
    await this.ensureConnection();
    return CrmCalendarAccount.countDocuments({ isActive: true }).exec();
  }
}

export const calendarAccountRepository = new CalendarAccountRepository();
