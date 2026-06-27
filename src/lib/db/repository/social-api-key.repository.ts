import SocialApiKey, { ISocialApiKey } from '../models/social-api-key.model';
import { connectDB } from '@/lib/mongodb';

export interface CreateSocialApiKeyInput {
    createdByUserId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    scopes?: string[];
    expiresAt?: Date;
}

class SocialApiKeyRepository {
    async create(input: CreateSocialApiKeyInput): Promise<ISocialApiKey> {
        await connectDB();
        const key = new SocialApiKey(input);
        return key.save();
    }

    async findByHash(hash: string): Promise<ISocialApiKey | null> {
        await connectDB();
        return SocialApiKey.findOne({ keyHash: hash }).exec();
    }

    async listByOrg(orgId: string): Promise<ISocialApiKey[]> {
        await connectDB();
        return SocialApiKey.find({ })
            .sort({ createdAt: -1 })
            .exec();
    }

    async revoke(id: string): Promise<ISocialApiKey | null> {
        await connectDB();
        return SocialApiKey.findByIdAndUpdate(
            id,
            { $set: { revoked: true } },
            { new: true }
        ).exec();
    }

    async touchUsed(id: string): Promise<ISocialApiKey | null> {
        await connectDB();
        return SocialApiKey.findByIdAndUpdate(
            id,
            { $set: { lastUsedAt: new Date() } },
            { new: true }
        ).exec();
    }
}

export const socialApiKeyRepository = new SocialApiKeyRepository();
