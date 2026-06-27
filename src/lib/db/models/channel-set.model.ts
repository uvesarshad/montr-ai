import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IChannelSet extends Document {
    brandId: string;
    userId: string;
    name: string;
    accountIds: string[];             // The saved channel selection

    createdAt: Date;
    updatedAt: Date;
}

const ChannelSetSchema = new Schema<IChannelSet>(
    {
        brandId: {
            type: String,
            required: true,
            index: true,
        },
        userId: {
            type: String,
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        accountIds: {
            type: [String],
            default: [],
        },
    },
    {
        timestamps: true,
        collection: 'channel_sets',
    }
);

// Indexes
ChannelSetSchema.index({ brandId: 1 });

const ChannelSet: Model<IChannelSet> =
    mongoose.models.ChannelSet ||
    mongoose.model<IChannelSet>('ChannelSet', ChannelSetSchema);

export default ChannelSet;
