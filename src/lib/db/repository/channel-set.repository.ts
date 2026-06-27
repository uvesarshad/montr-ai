import ChannelSet, { IChannelSet } from '../models/channel-set.model';
import { connectDB } from '@/lib/mongodb';

export interface CreateChannelSetInput {
    brandId: string;
    userId: string;
    name: string;
    accountIds?: string[];
}

export interface UpdateChannelSetInput {
    name?: string;
    accountIds?: string[];
}

class ChannelSetRepository {
    async create(input: CreateChannelSetInput): Promise<IChannelSet> {
        await connectDB();
        const channelSet = new ChannelSet(input);
        return channelSet.save();
    }

    async findById(id: string): Promise<IChannelSet | null> {
        await connectDB();
        return ChannelSet.findById(id).exec();
    }

    async listByBrand(brandId: string): Promise<IChannelSet[]> {
        await connectDB();
        return ChannelSet.find({ brandId })
            .sort({ createdAt: -1 })
            .exec();
    }

    async update(id: string, input: UpdateChannelSetInput): Promise<IChannelSet | null> {
        await connectDB();
        return ChannelSet.findByIdAndUpdate(id, { $set: input }, { new: true }).exec();
    }

    async delete(id: string): Promise<boolean> {
        await connectDB();
        const result = await ChannelSet.deleteOne({ _id: id }).exec();
        return result.deletedCount > 0;
    }
}

export const channelSetRepository = new ChannelSetRepository();
