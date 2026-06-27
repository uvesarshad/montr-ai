import { connectDB } from '@/lib/mongodb';
import AdLeadFieldMap, { IAdLeadFieldMap } from '@/lib/db/models/ad-lead-field-map.model';
import type { AdPlatform } from '@/lib/db/models/ad-account.model';

export interface FieldMapValues {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
}

export const adLeadFieldMapRepository = {
    async find(platform: AdPlatform, formId: string): Promise<IAdLeadFieldMap | null> {
        await connectDB();
        return await AdLeadFieldMap.findOne({ platform, formId });
    },

    async listByOrganization(): Promise<IAdLeadFieldMap[]> {
        await connectDB();
        return await AdLeadFieldMap.find({ }).sort({ updatedAt: -1 });
    },

    async upsert(
        platform: AdPlatform,
        formId: string,
        fieldMap: FieldMapValues,
    ): Promise<IAdLeadFieldMap> {
        await connectDB();
        const doc = await AdLeadFieldMap.findOneAndUpdate(
            { platform, formId },
            { $set: { fieldMap } },
            { new: true, upsert: true },
        );
        return doc;
    },

    async delete(platform: AdPlatform, formId: string): Promise<boolean> {
        await connectDB();
        const result = await AdLeadFieldMap.deleteOne({ platform, formId });
        return result.deletedCount > 0;
    },
};

export default adLeadFieldMapRepository;
