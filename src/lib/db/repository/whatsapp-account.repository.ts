import WhatsAppAccount, { IWhatsAppAccount } from '../models/whatsapp-account.model';

export interface CreateWhatsAppAccountInput {
    phoneNumberId: string;
    wabaId: string;
    accessToken: string;
    name?: string;
    phoneNumber?: string;
    createdById: string;
}

export interface UpdateWhatsAppAccountInput {
    name?: string;
    accessToken?: string;
    phoneNumber?: string;
    status?: string;
}

class WhatsAppAccountRepository {
    async create(input: CreateWhatsAppAccountInput): Promise<IWhatsAppAccount> {
        return await WhatsAppAccount.create(input);
    }

    async findById(id: string): Promise<IWhatsAppAccount | null> {
        return await WhatsAppAccount.findById(id);
    }

    async findByOrganizationId(): Promise<IWhatsAppAccount[]> {
        return await WhatsAppAccount.find({ });
    }

    async find(filter: Record<string, unknown>): Promise<IWhatsAppAccount[]> {
        return await WhatsAppAccount.find(filter);
    }

    /**
     * Find accounts by user ID (created by query)
     */
    async findByUserId(userId: string): Promise<IWhatsAppAccount[]> {
        return await WhatsAppAccount.find({ createdById: userId });
    }

    async findByPhoneNumberId(phoneNumberId: string): Promise<IWhatsAppAccount | null> {
        return await WhatsAppAccount.findOne({ phoneNumberId });
    }

    async update(id: string, input: UpdateWhatsAppAccountInput): Promise<IWhatsAppAccount | null> {
        return await WhatsAppAccount.findByIdAndUpdate(id, { $set: input }, { new: true });
    }

    async delete(id: string): Promise<boolean> {
        const result = await WhatsAppAccount.findByIdAndDelete(id);
        return !!result;
    }
}

export const whatsappAccountRepository = new WhatsAppAccountRepository();
