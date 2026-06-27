import mongoose, { Types } from 'mongoose';
import CrmEmailAccount, { ICrmEmailAccount, IOAuthCredentials, IImapConfig, ISmtpConfig } from '../../models/crm/email-account.model';

export interface CreateEmailAccountDto {
  userId: string;
  email: string;
  displayName?: string;
  provider: 'gmail' | 'outlook' | 'imap';
  oauth?: IOAuthCredentials;
  imap?: IImapConfig;
  smtp?: ISmtpConfig;
  syncFolders?: string[];
  syncStartDate?: Date;
  autoLinkContacts?: boolean;
  autoCreateContacts?: boolean;
  autoCreateCompanies?: boolean;
  signature?: string;
}

export interface UpdateEmailAccountDto {
  displayName?: string;
  oauth?: IOAuthCredentials;
  imap?: IImapConfig;
  smtp?: ISmtpConfig;
  syncEnabled?: boolean;
  syncFolders?: string[];
  syncStartDate?: Date;
  autoLinkContacts?: boolean;
  autoCreateContacts?: boolean;
  autoCreateCompanies?: boolean;
  signature?: string;
  isActive?: boolean;
}

export class EmailAccountRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findById(id: string): Promise<ICrmEmailAccount | null> {
    await this.ensureConnection();
    return CrmEmailAccount.findOne({ _id: id }).exec();
  }

  async findByUser(userId: string): Promise<ICrmEmailAccount[]> {
    await this.ensureConnection();
    return CrmEmailAccount.find({
      userId: new Types.ObjectId(userId),
    }).exec();
  }

  async findByEmail(email: string): Promise<ICrmEmailAccount | null> {
    await this.ensureConnection();
    return CrmEmailAccount.findOne({
      email: email.toLowerCase(),
    }).exec();
  }

  async findActiveForSync(): Promise<ICrmEmailAccount[]> {
    await this.ensureConnection();
    return CrmEmailAccount.find({
      isActive: true,
      syncEnabled: true,
    }).exec();
  }

  async create(data: CreateEmailAccountDto): Promise<ICrmEmailAccount> {
    await this.ensureConnection();

    const account = new CrmEmailAccount({
      userId: new Types.ObjectId(data.userId),
      email: data.email.toLowerCase(),
      displayName: data.displayName,
      provider: data.provider,
      isActive: true,
      oauth: data.oauth,
      imap: data.imap,
      smtp: data.smtp,
      syncEnabled: true,
      syncFolders: data.syncFolders || ['INBOX', 'Sent'],
      syncStartDate: data.syncStartDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      autoLinkContacts: data.autoLinkContacts ?? true,
      autoCreateContacts: data.autoCreateContacts ?? false,
      autoCreateCompanies: data.autoCreateCompanies ?? false,
      totalEmailsSynced: 0,
      signature: data.signature,
    });

    return account.save();
  }

  async update(
    id: string,
    data: UpdateEmailAccountDto
  ): Promise<ICrmEmailAccount | null> {
    await this.ensureConnection();
    return CrmEmailAccount.findOneAndUpdate(
      { _id: id },
      { $set: data },
      { new: true }
    ).exec();
  }

  async updateOAuth(
    id: string,
    oauth: IOAuthCredentials
  ): Promise<ICrmEmailAccount | null> {
    await this.ensureConnection();
    return CrmEmailAccount.findOneAndUpdate(
      { _id: id },
      { $set: { oauth } },
      { new: true }
    ).exec();
  }

  async updateSyncState(
    id: string,
    state: {
      lastSyncAt?: Date;
      lastSyncError?: string;
      syncCursor?: string;
      totalEmailsSynced?: number;
    }
  ): Promise<void> {
    await this.ensureConnection();
    await CrmEmailAccount.updateOne(
      { _id: id },
      { $set: state }
    ).exec();
  }

  async incrementEmailCount(id: string, count: number = 1): Promise<void> {
    await this.ensureConnection();
    await CrmEmailAccount.updateOne(
      { _id: id },
      { $inc: { totalEmailsSynced: count } }
    ).exec();
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmEmailAccount.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }

  async countByOrganization(): Promise<number> {
    await this.ensureConnection();
    return CrmEmailAccount.countDocuments({ isActive: true }).exec();
  }
}

export const emailAccountRepository = new EmailAccountRepository();
