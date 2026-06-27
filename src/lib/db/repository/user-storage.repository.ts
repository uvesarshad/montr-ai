import mongoose from 'mongoose';
import crypto from 'crypto';
import UserStorage, { IUserStorage } from '../models/user-storage.model';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production!';

export class UserStorageRepository {
    private encryptToken(token: string): string {
        const iv = crypto.randomBytes(16);
        const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(token, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return `${iv.toString('hex')}:${encrypted}`;
    }

    decryptToken(encryptedToken: string): string {
        try {
            const [ivHex, encrypted] = encryptedToken.split(':');
            const iv = Buffer.from(ivHex, 'hex');
            const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch {
            return '';
        }
    }

    async create(input: {
        userId: string;
        brandId: string;
        provider: 'google-drive';
        accessToken: string;
        refreshToken: string;
        tokenExpiresAt: Date;
        accountEmail?: string;
        accountName?: string;
        rootFolderId?: string;
        usedBytes?: number;
        quotaBytes?: number;
    }): Promise<IUserStorage> {
        await this.ensureConnection();

        const storage = new UserStorage({
            userId: input.userId,
            brandId: input.brandId,
            provider: input.provider,
            accessTokenEncrypted: this.encryptToken(input.accessToken),
            refreshTokenEncrypted: this.encryptToken(input.refreshToken),
            tokenExpiresAt: input.tokenExpiresAt,
            accountEmail: input.accountEmail,
            accountName: input.accountName,
            rootFolderId: input.rootFolderId,
            usedBytes: input.usedBytes || 0,
            quotaBytes: input.quotaBytes || 0,
            isActive: true,
        });

        return storage.save();
    }

    async findByUserId(userId: string): Promise<IUserStorage[]> {
        await this.ensureConnection();
        return UserStorage.find({ userId, isActive: true }).exec();
    }

    async findByBrandId(brandId: string): Promise<IUserStorage[]> {
        await this.ensureConnection();
        return UserStorage.find({ brandId, isActive: true }).exec();
    }

    async findById(id: string): Promise<IUserStorage | null> {
        await this.ensureConnection();
        return UserStorage.findById(id).exec();
    }

    async updateTokens(id: string, accessToken: string, refreshToken: string, expiresAt: Date): Promise<IUserStorage | null> {
        await this.ensureConnection();
        return UserStorage.findByIdAndUpdate(
            id,
            {
                $set: {
                    accessTokenEncrypted: this.encryptToken(accessToken),
                    refreshTokenEncrypted: this.encryptToken(refreshToken),
                    tokenExpiresAt: expiresAt,
                },
            },
            { new: true }
        ).exec();
    }

    async delete(id: string): Promise<boolean> {
        await this.ensureConnection();
        const result = await UserStorage.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }

    async deactivate(id: string): Promise<boolean> {
        await this.ensureConnection();
        const result = await UserStorage.updateOne({ _id: id }, { $set: { isActive: false } });
        return result.modifiedCount > 0;
    }

    private async ensureConnection(): Promise<void> {
        if (mongoose.connection.readyState !== 1) {
            const { connectMongoose } = await import('@/lib/mongodb');
            await connectMongoose();
        }
    }
}

export const userStorageRepository = new UserStorageRepository();
