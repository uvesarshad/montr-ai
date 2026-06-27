import { connectDB } from '@/lib/mongodb';
import CrmContact, { ICrmContact } from '@/lib/db/models/crm/contact.model';
import { Types } from 'mongoose';

/**
 * WhatsApp Contact Repository
 * Handles WhatsApp-specific contact operations using the underlying CRM Contact model
 */
export const whatsappContactRepository = {
    /**
     * Find contacts by IDs
     */
    async findByIds(ids: string[]): Promise<ICrmContact[]> {
        await connectDB();

        // Convert string IDs to ObjectIds
        const objectIds = ids
            .filter(id => Types.ObjectId.isValid(id))
            .map(id => new Types.ObjectId(id));

        return await CrmContact.find({
            _id: { $in: objectIds }
        });
    },

    /**
     * Find contact by ID
     */
    async findById(id: string): Promise<ICrmContact | null> {
        await connectDB();
        const query: Record<string, unknown> = { _id: id };
        return await CrmContact.findOne(query);
    }
};

export default whatsappContactRepository;
