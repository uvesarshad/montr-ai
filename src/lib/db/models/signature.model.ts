import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISignature extends Document {
    brandId: string;
    userId: string;
    name: string;
    text: string;
    autoAdd: boolean;                 // At most one default per brand (not enforced in schema)

    createdAt: Date;
    updatedAt: Date;
}

const SignatureSchema = new Schema<ISignature>(
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
        text: {
            type: String,
            required: true,
        },
        autoAdd: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
        collection: 'signatures',
    }
);

// Indexes
SignatureSchema.index({ brandId: 1 });

const Signature: Model<ISignature> =
    mongoose.models.Signature ||
    mongoose.model<ISignature>('Signature', SignatureSchema);

export default Signature;
