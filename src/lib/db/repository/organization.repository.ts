import mongoose from 'mongoose';
import Organization, { IOrganization } from '../models/organization.model';

export interface CreateOrganizationDto {
    name: string;
    email?: string;
    adminId: string;
    subscriptionPlanId?: string;
    memberLimit?: number;
    allowedEmailDomains?: string[];
}

export interface UpdateOrganizationDto {
    name?: string;
    email?: string | null;
    subscriptionPlanId?: string;
    memberLimit?: number;
    allowedEmailDomains?: string[];
    status?: 'active' | 'inactive' | 'suspended';
}

export class OrganizationRepository {
    /**
     * Find organization by ID
     */
    async findById(orgId: string): Promise<IOrganization | null> {
        await this.ensureConnection();
        return Organization.findById(orgId).exec();
    }

    /**
     * Find all organizations
     */
    async findAll(): Promise<IOrganization[]> {
        await this.ensureConnection();
        return Organization.find().sort({ createdAt: -1 }).exec();
    }

    /**
     * Find organization by admin ID
     */
    async findByAdminId(adminId: string): Promise<IOrganization | null> {
        await this.ensureConnection();
        return Organization.findOne({ adminId }).exec();
    }

    /**
     * Create new organization
     */
    async create(data: CreateOrganizationDto): Promise<IOrganization> {
        await this.ensureConnection();

        const org = new Organization({
            name: data.name,
            email: data.email || null,
            adminId: data.adminId,
            subscriptionPlanId: data.subscriptionPlanId || null,
            memberLimit: data.memberLimit || 5,
            allowedEmailDomains: data.allowedEmailDomains || [],
            members: [data.adminId], // Admin is automatically a member
            status: 'active',
        });

        return org.save();
    }

    /**
     * Update organization
     */
    async update(orgId: string, data: UpdateOrganizationDto): Promise<IOrganization | null> {
        await this.ensureConnection();

        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (data.name) updateData.name = data.name;
        if (data.email !== undefined) updateData.email = data.email;
        if (data.subscriptionPlanId !== undefined) updateData.subscriptionPlanId = data.subscriptionPlanId;
        if (data.memberLimit !== undefined) updateData.memberLimit = data.memberLimit;
        if (data.allowedEmailDomains) updateData.allowedEmailDomains = data.allowedEmailDomains;
        if (data.status) updateData.status = data.status;

        return Organization.findByIdAndUpdate(
            orgId,
            { $set: updateData },
            { new: true }
        ).exec();
    }

    /**
     * Add member to organization
     */
    async addMember(orgId: string, userId: string): Promise<IOrganization | null> {
        await this.ensureConnection();

        return Organization.findByIdAndUpdate(
            orgId,
            {
                $addToSet: { members: userId },
                $set: { updatedAt: new Date() }
            },
            { new: true }
        ).exec();
    }

    /**
     * Remove member from organization
     */
    async removeMember(orgId: string, userId: string): Promise<IOrganization | null> {
        await this.ensureConnection();

        return Organization.findByIdAndUpdate(
            orgId,
            {
                $pull: { members: userId },
                $set: { updatedAt: new Date() }
            },
            { new: true }
        ).exec();
    }

    /**
     * Delete organization
     */
    async delete(orgId: string): Promise<boolean> {
        await this.ensureConnection();
        const result = await Organization.deleteOne({ _id: orgId }).exec();
        return result.deletedCount > 0;
    }

    /**
     * Get organization stats (member count, etc.)
     */
    async getStats(orgId: string): Promise<{ memberCount: number } | null> {
        await this.ensureConnection();
        const org = await Organization.findById(orgId).exec();
        if (!org) return null;
        return {
            memberCount: org.members.length,
        };
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
export const organizationRepository = new OrganizationRepository();
