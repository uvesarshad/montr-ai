import mongoose from 'mongoose';
import WhatsAppContactGroup, { IWhatsAppContactGroup } from '../models/whatsapp-contact-group.model';
import WhatsAppContactGroupMember from '../models/whatsapp-contact-group-member.model';

export interface CreateGroupDto {
    whatsappAccountId: string;
    name: string;
    description?: string;
    createdById: string;
}

export interface UpdateGroupDto {
    name?: string;
    description?: string;
}

export class WhatsAppContactGroupRepository {
    private async ensureConnection(): Promise<void> {
        if (mongoose.connection.readyState !== 1) {
            const { connectMongoose } = await import('@/lib/mongodb');
            await connectMongoose();
        }
    }

    async create(data: CreateGroupDto): Promise<IWhatsAppContactGroup> {
        await this.ensureConnection();
        const group = new WhatsAppContactGroup(data);
        return group.save();
    }

    async findById(id: string): Promise<IWhatsAppContactGroup | null> {
        await this.ensureConnection();
        return WhatsAppContactGroup.findById(id).exec();
    }

    async findByOrganization(includeDeleted: boolean = false): Promise<IWhatsAppContactGroup[]> {
        await this.ensureConnection();
        const query: Record<string, unknown> = { };
        if (!includeDeleted) {
            query.deletedAt = null;
        }
        return WhatsAppContactGroup.find(query).sort({ name: 1 }).exec();
    }

    async findByAccount(whatsappAccountId: string, includeDeleted: boolean = false): Promise<IWhatsAppContactGroup[]> {
        await this.ensureConnection();
        const query: Record<string, unknown> = { whatsappAccountId };
        if (!includeDeleted) {
            query.deletedAt = null;
        }
        return WhatsAppContactGroup.find(query).sort({ name: 1 }).exec();
    }

    async update(id: string, data: UpdateGroupDto): Promise<IWhatsAppContactGroup | null> {
        await this.ensureConnection();
        return WhatsAppContactGroup.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
    }

    async softDelete(id: string): Promise<IWhatsAppContactGroup | null> {
        await this.ensureConnection();
        return WhatsAppContactGroup.findByIdAndUpdate(id, { $set: { deletedAt: new Date() } }, { new: true }).exec();
    }

    async hardDelete(id: string): Promise<boolean> {
        await this.ensureConnection();
        // Delete all members first
        await WhatsAppContactGroupMember.deleteMany({ groupId: id }).exec();
        // Delete group
        const result = await WhatsAppContactGroup.deleteOne({ _id: id }).exec();
        return result.deletedCount > 0;
    }

    async addContacts(groupId: string, contactIds: string[], addedById: string): Promise<number> {
        await this.ensureConnection();

        const group = await WhatsAppContactGroup.findById(groupId).exec();
        if (!group) throw new Error('Group not found');

        let addedCount = 0;

        for (const contactId of contactIds) {
            try {
                const member = new WhatsAppContactGroupMember({
                    groupId,
                    contactId,
                    addedById,
                });
                await member.save();
                addedCount++;
            } catch (error: unknown) {
                // Skip duplicates (unique constraint error)
                if ((error as { code?: number }).code !== 11000) {
                    throw error;
                }
            }
        }

        // Update contact count
        await this.updateContactCount(groupId);

        return addedCount;
    }

    async removeContacts(groupId: string, contactIds: string[]): Promise<number> {
        await this.ensureConnection();

        const result = await WhatsAppContactGroupMember.deleteMany({
            groupId,
            contactId: { $in: contactIds },
        }).exec();

        // Update contact count
        await this.updateContactCount(groupId);

        return result.deletedCount;
    }

    async getGroupContacts(groupId: string, limit: number = 100, skip: number = 0): Promise<string[]> {
        await this.ensureConnection();

        const members = await WhatsAppContactGroupMember.find({ groupId })
            .select('contactId')
            .limit(limit)
            .skip(skip)
            .exec();

        return members.map((m) => m.contactId.toString());
    }

    async getContactGroups(contactId: string): Promise<IWhatsAppContactGroup[]> {
        await this.ensureConnection();

        const members = await WhatsAppContactGroupMember.find({ contactId }).select('groupId').exec();
        const groupIds = members.map((m) => m.groupId);

        return WhatsAppContactGroup.find({
            _id: { $in: groupIds },
            deletedAt: null,
        })
            .sort({ name: 1 })
            .exec();
    }

    async isContactInGroup(groupId: string, contactId: string): Promise<boolean> {
        await this.ensureConnection();
        const count = await WhatsAppContactGroupMember.countDocuments({ groupId, contactId }).exec();
        return count > 0;
    }

    async updateContactCount(groupId: string): Promise<void> {
        await this.ensureConnection();
        const count = await WhatsAppContactGroupMember.countDocuments({ groupId }).exec();
        await WhatsAppContactGroup.findByIdAndUpdate(groupId, { $set: { contactCount: count } }).exec();
    }

    async getGroupStats(): Promise<{
        totalGroups: number;
        totalContacts: number;
        avgContactsPerGroup: number;
    }> {
        await this.ensureConnection();

        const groups = await WhatsAppContactGroup.find({ deletedAt: null }).exec();
        const totalGroups = groups.length;
        const totalContacts = groups.reduce((sum, g) => sum + g.contactCount, 0);
        const avgContactsPerGroup = totalGroups > 0 ? totalContacts / totalGroups : 0;

        return {
            totalGroups,
            totalContacts,
            avgContactsPerGroup: Math.round(avgContactsPerGroup * 10) / 10,
        };
    }
}

export const whatsappContactGroupRepository = new WhatsAppContactGroupRepository();
