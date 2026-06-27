import { connectDB } from '@/lib/mongodb';
import WhatsAppTemplate, { IWhatsAppTemplate } from '@/lib/db/models/whatsapp-template.model';

export interface CreateWhatsAppTemplateInput {
    whatsappAccountId: string;
    metaId: string;
    name: string;
    language: string;
    status: string;
    category: string;
    components: unknown[];
}

/**
 * WhatsApp Template Repository
 */
export const whatsappTemplateRepository = {
    /**
     * Create or Update a template (Upsert)
     */
    async upsert(input: CreateWhatsAppTemplateInput): Promise<IWhatsAppTemplate> {
        await connectDB();

        return await WhatsAppTemplate.findOneAndUpdate(
            {
                whatsappAccountId: input.whatsappAccountId,
                metaId: input.metaId
            },
            {
                ...input,
                lastSyncedAt: new Date(),
            },
            { upsert: true, new: true }
        );
    },

    /**
     * Find templates for an account
     */
    async findByAccountId(whatsappAccountId: string): Promise<IWhatsAppTemplate[]> {
        await connectDB();
        return await WhatsAppTemplate.find({ whatsappAccountId }).sort({ name: 1 });
    },

    /**
     * Find templates for an organization
     */
    async findByOrganizationId(): Promise<IWhatsAppTemplate[]> {
        await connectDB();
        return await WhatsAppTemplate.find({ }).sort({ name: 1 });
    },

    /**
     * Find by ID
     */
    async findById(id: string): Promise<IWhatsAppTemplate | null> {
        await connectDB();
        return await WhatsAppTemplate.findById(id);
    },

    /**
     * Find by Meta ID
     */
    async findByMetaId(metaId: string): Promise<IWhatsAppTemplate | null> {
        await connectDB();
        return await WhatsAppTemplate.findOne({ metaId });
    },

    /**
     * Update a template by ID
     */
    async update(id: string, input: Partial<CreateWhatsAppTemplateInput> & { metaTemplateId?: string; status?: string; submittedAt?: Date; metaId?: string }): Promise<IWhatsAppTemplate | null> {
        await connectDB();
        return await WhatsAppTemplate.findByIdAndUpdate(id, input, { new: true });
    },

    /**
     * Delete a template
     */
    async delete(id: string): Promise<boolean> {
        await connectDB();
        const result = await WhatsAppTemplate.findByIdAndDelete(id);
        return !!result;
    },
};

export default whatsappTemplateRepository;
