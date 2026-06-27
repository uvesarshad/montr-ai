import { connectDB } from '@/lib/mongodb';
import WhatsAppAutoReply, { IWhatsAppAutoReply } from '@/lib/db/models/whatsapp-auto-reply.model';

export interface CreateAutoReplyInput {
    whatsappAccountId: string;
    name: string;
    trigger: {
        type: 'keyword' | 'greeting' | 'always' | 'business_hours';
        keywords?: string[];
    };
    conditions?: {
        businessHours?: {
            enabled: boolean;
            timezone?: string;
            schedule?: Record<string, unknown>;
        };
        tags?: string[];
    };
    response: {
        type: 'text' | 'template';
        content: string;
        templateLanguage?: string;
    };
    priority?: number;
    createdById: string;
}

export interface UpdateAutoReplyInput {
    name?: string;
    isActive?: boolean;
    trigger?: {
        type: 'keyword' | 'greeting' | 'always' | 'business_hours';
        keywords?: string[];
    };
    conditions?: Record<string, unknown>;
    response?: {
        type: 'text' | 'template';
        content: string;
        templateLanguage?: string;
    };
    priority?: number;
}

/**
 * WhatsApp Auto-Reply Repository
 */
export const whatsappAutoReplyRepository = {
    /**
     * Create a new auto-reply
     */
    async create(input: CreateAutoReplyInput): Promise<IWhatsAppAutoReply> {
        await connectDB();
        const autoReply = new WhatsAppAutoReply(input);
        return await autoReply.save();
    },

    /**
     * Find by ID
     */
    async findById(id: string): Promise<IWhatsAppAutoReply | null> {
        await connectDB();
        return await WhatsAppAutoReply.findById(id);
    },

    /**
     * Find all active auto-replies for an account
     */
    async findActiveByAccount(accountId: string): Promise<IWhatsAppAutoReply[]> {
        await connectDB();
        return await WhatsAppAutoReply.find({
            whatsappAccountId: accountId,
            isActive: true,
        }).sort({ priority: -1 }); // Higher priority first
    },

    /**
     * Find all auto-replies for an organization
     */
    async findByOrganization(): Promise<IWhatsAppAutoReply[]> {
        await connectDB();
        return await WhatsAppAutoReply.find({ })
            .sort({ createdAt: -1 })
            .populate('whatsappAccountId', 'name phoneNumber');
    },

    /**
     * Update an auto-reply
     */
    async update(id: string, input: UpdateAutoReplyInput): Promise<IWhatsAppAutoReply | null> {
        await connectDB();
        return await WhatsAppAutoReply.findByIdAndUpdate(id, input, { new: true });
    },

    /**
     * Delete an auto-reply
     */
    async delete(id: string): Promise<boolean> {
        await connectDB();
        const result = await WhatsAppAutoReply.findByIdAndDelete(id);
        return !!result;
    },

    /**
     * Toggle active status
     */
    async toggleActive(id: string): Promise<IWhatsAppAutoReply | null> {
        await connectDB();
        const autoReply = await WhatsAppAutoReply.findById(id);
        if (!autoReply) return null;

        autoReply.isActive = !autoReply.isActive;
        return await autoReply.save();
    },
};

export default whatsappAutoReplyRepository;
