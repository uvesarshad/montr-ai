import Signature, { ISignature } from '../models/signature.model';
import { connectDB } from '@/lib/mongodb';

export interface CreateSignatureInput {
    brandId: string;
    userId: string;
    name: string;
    text: string;
    autoAdd?: boolean;
}

export interface UpdateSignatureInput {
    name?: string;
    text?: string;
    autoAdd?: boolean;
}

class SignatureRepository {
    async create(input: CreateSignatureInput): Promise<ISignature> {
        await connectDB();
        const signature = new Signature(input);
        return signature.save();
    }

    async findById(id: string): Promise<ISignature | null> {
        await connectDB();
        return Signature.findById(id).exec();
    }

    async listByBrand(brandId: string): Promise<ISignature[]> {
        await connectDB();
        return Signature.find({ brandId })
            .sort({ createdAt: -1 })
            .exec();
    }

    async update(id: string, input: UpdateSignatureInput): Promise<ISignature | null> {
        await connectDB();
        return Signature.findByIdAndUpdate(id, { $set: input }, { new: true }).exec();
    }

    async delete(id: string): Promise<boolean> {
        await connectDB();
        const result = await Signature.deleteOne({ _id: id }).exec();
        return result.deletedCount > 0;
    }

    /**
     * Return the auto-add (default) signature for a brand, if any.
     */
    async getAutoAdd(input: {
        brandId: string;
    }): Promise<ISignature | null> {
        await connectDB();
        return Signature.findOne({
            brandId: input.brandId,
            autoAdd: true,
        }).exec();
    }
}

export const signatureRepository = new SignatureRepository();
