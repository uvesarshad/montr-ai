// OSS single-tenant override of src/lib/db/repository/user.repository.ts — generated CP-2 hand-patch; org-stripped, userId-scoped.
import mongoose from 'mongoose';
import User, { IUser } from '../models/user.model';
import bcrypt from 'bcryptjs';

export interface CreateUserDto {
    email?: string;
    password?: string;
    name: string;
    phoneNumber?: string;
    image?: string;
    firebaseUid?: string; // For migration
}

export interface UpdateUserDto {
    name?: string;
    image?: string;
    username?: string;
    email?: string;
    phoneNumber?: string;
    firstName?: string;
    lastName?: string;
    company?: string;
    bio?: string;
    billingAddress?: {
        street?: string;
        city?: string;
        state?: string;
        zip?: string;
        country?: string;
    };
    userApiKeys?: Record<string, string>;
    theme?: string;
    aiPreferences?: Record<string, { modelId: string; providerId: string }>;
    hasSeenOnboarding?: boolean;
}

export class UserRepository {
    /**
     * Find user by ID
     */
    async findById(userId: string): Promise<IUser | null> {
        await this.ensureConnection();

        return User.findById(userId).exec();
    }

    /**
     * Find user by email
     */
    async findByEmail(email: string): Promise<IUser | null> {
        await this.ensureConnection();

        return User.findOne({ email: email.toLowerCase() }).exec();
    }

    /**
     * Find user by phone number
     */
    async findByPhoneNumber(phoneNumber: string): Promise<IUser | null> {
        await this.ensureConnection();

        return User.findOne({ phoneNumber }).exec();
    }

    /**
     * Find user by Firebase UID (for migration)
     */
    async findByFirebaseUid(firebaseUid: string): Promise<IUser | null> {
        await this.ensureConnection();

        return User.findOne({ firebaseUid }).exec();
    }

    /**
     * Find user by username
     */
    async findByUsername(username: string): Promise<IUser | null> {
        await this.ensureConnection();

        return User.findOne({ username: username.toLowerCase() }).exec();
    }

    /**
     * Create new user
     */
    async create(data: CreateUserDto): Promise<IUser> {
        await this.ensureConnection();

        const userData: Record<string, unknown> = {
            name: data.name,
            role: 'user',
        };

        if (data.email) {
            userData.email = data.email.toLowerCase();
        }

        if (data.password) {
            userData.hashedPassword = await bcrypt.hash(data.password, 12);
        }

        if (data.phoneNumber) {
            userData.phoneNumber = data.phoneNumber;
        }

        if (data.image) {
            userData.image = data.image;
        }

        if (data.firebaseUid) {
            userData.firebaseUid = data.firebaseUid;
        }

        const user = new User(userData);
        return user.save();
    }

    /**
     * Update user
     */
    async update(userId: string, data: UpdateUserDto): Promise<IUser | null> {
        await this.ensureConnection();

        const updateData: Record<string, unknown> = {};

        if (data.name) updateData.name = data.name;
        if (data.image) updateData.image = data.image;
        if (data.username) updateData.username = data.username.toLowerCase();
        if (data.email) updateData.email = data.email.toLowerCase();
        if (data.phoneNumber) updateData.phoneNumber = data.phoneNumber;

        // New fields
        if (data.firstName) updateData.firstName = data.firstName;
        if (data.lastName) updateData.lastName = data.lastName;
        if (data.company) updateData.company = data.company;
        if (data.bio) updateData.bio = data.bio;
        if (data.billingAddress) updateData.billingAddress = data.billingAddress;
        if (data.userApiKeys) updateData.userApiKeys = data.userApiKeys;
        if (data.aiPreferences) updateData.aiPreferences = data.aiPreferences;

        return User.findByIdAndUpdate(
            userId,
            { $set: updateData },
            { new: true }
        ).exec();
    }

    /**
     * Update user password
     */
    async updatePassword(userId: string, newPassword: string): Promise<boolean> {
        await this.ensureConnection();

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        const result = await User.updateOne(
            { _id: userId },
            { $set: { hashedPassword } }
        ).exec();

        return result.modifiedCount > 0;
    }

    /**
     * Verify password
     */
    async verifyPassword(email: string, password: string): Promise<IUser | null> {
        await this.ensureConnection();

        const user = await User.findOne({ email: email.toLowerCase() })
            .select('+hashedPassword')
            .exec();

        if (!user || !user.hashedPassword) {
            return null;
        }

        const isValid = await bcrypt.compare(password, user.hashedPassword);
        if (!isValid) {
            return null;
        }

        // Return user without password
        return User.findById(user._id).exec();
    }

    /**
     * Delete user
     */
    async delete(userId: string): Promise<boolean> {
        await this.ensureConnection();

        const result = await User.deleteOne({ _id: userId }).exec();
        return result.deletedCount > 0;
    }

    /**
     * Add OAuth account to user
     */
    async addAccount(
        userId: string,
        provider: 'google' | 'email' | 'whatsapp' | 'credentials',
        providerAccountId: string,
        type: 'oauth' | 'email' | 'credentials'
    ): Promise<IUser | null> {
        await this.ensureConnection();

        return User.findByIdAndUpdate(
            userId,
            {
                $addToSet: {
                    accounts: { provider, providerAccountId, type }
                }
            },
            { new: true }
        ).exec();
    }

    /**
     * Verify email
     */
    async verifyEmail(userId: string): Promise<boolean> {
        await this.ensureConnection();

        const result = await User.updateOne(
            { _id: userId },
            { $set: { emailVerified: true } }
        ).exec();

        return result.modifiedCount > 0;
    }

    /**
     * Verify phone
     */
    async verifyPhone(userId: string): Promise<boolean> {
        await this.ensureConnection();

        const result = await User.updateOne(
            { _id: userId },
            { $set: { phoneVerified: new Date() } }
        ).exec();

        return result.modifiedCount > 0;
    }

    /**
     * Find all users (for super_admin)
     */
    async findAll(): Promise<IUser[]> {
        await this.ensureConnection();
        return User.find().sort({ createdAt: -1 }).exec();
    }

    /**
     * Find users by organization. Single-tenant OSS: there is one implicit
     * workspace, so the org filter is a no-op and this returns ALL users. The
     * `organizationId` param is retained (ignored) so surviving core call-sites
     * — notification-service, whatsapp/team/agents, crm/members — keep their
     * arity. Mirrors the (org-stripped) source: no `{ organizationId }` filter.
     */
    async findByOrganization(_organizationId?: string): Promise<IUser[]> {
        await this.ensureConnection();
        return User.find().sort({ createdAt: -1 }).exec();
    }

    /**
     * Assign a user to an organization. Single-tenant OSS: there is no org to
     * move a user between, so this is a no-op that returns the user unchanged.
     * Param retained so callers (crm/auth-helper, admin/create-user) keep arity.
     */
    async updateOrganization(userId: string, _organizationId?: string | null): Promise<IUser | null> {
        await this.ensureConnection();
        return User.findById(userId).exec();
    }

    /**
     * Assign (or clear) a user's CRM role. Scoped to the target user by id.
     */
    async assignCrmRole(
        userId: string,
        crmRoleId: string | null
    ): Promise<IUser | null> {
        await this.ensureConnection();
        return User.findOneAndUpdate(
            { _id: userId },
            { $set: { crmRoleId } },
            { new: true }
        ).exec();
    }

    /**
     * Clear a CRM role from every user that still holds it (used on
     * role deletion).
     */
    async clearCrmRole(crmRoleId: string): Promise<void> {
        await this.ensureConnection();
        await User.updateMany(
            { crmRoleId },
            { $set: { crmRoleId: null } }
        ).exec();
    }

    /**
     * Find users by IDs
     */
    async findByIds(userIds: string[]): Promise<IUser[]> {
        await this.ensureConnection();

        if (userIds.length === 0) {
            return [];
        }

        return User.find({ _id: { $in: userIds } })
            .select('name firstName lastName image email')
            .exec();
    }

    /**
     * Update user role
     */
    async updateRole(userId: string, role: 'user' | 'admin' | 'super_admin'): Promise<IUser | null> {
        await this.ensureConnection();
        return User.findByIdAndUpdate(
            userId,
            { $set: { role, updatedAt: new Date() } },
            { new: true }
        ).exec();
    }

    /**
     * Update canUseOwnApiKeys permission
     */
    async updateCanUseOwnApiKeys(userId: string, canUseOwnApiKeys: boolean): Promise<IUser | null> {
        await this.ensureConnection();
        return User.findByIdAndUpdate(
            userId,
            { $set: { canUseOwnApiKeys, updatedAt: new Date() } },
            { new: true }
        ).exec();
    }

    /**
     * Ensure MongoDB connection via Mongoose
     */
    private async ensureConnection(): Promise<void> {
        if (mongoose.connection.readyState !== 1) {
            const { connectMongoose } = await import('@/lib/mongodb');
            await connectMongoose();
        }
    }
}

// Export singleton instance
export const userRepository = new UserRepository();
