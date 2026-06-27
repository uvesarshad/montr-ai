
import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IMarketingProvider extends Document {
    name: string;
    type: 'brevo' | 'ses' | 'smtp';
    isActive: boolean;
    isDefault: boolean;

    // Encrypted credentials (handled by service layer encryption)
    credentials: {
        // Brevo
        apiKey?: string;
        // SES
        accessKeyId?: string;
        secretAccessKey?: string;
        region?: string;
        // SMTP
        host?: string;
        port?: number;
        username?: string;
        password?: string;
        secure?: boolean;
    };

    // Sender Configuration
    fromEmail: string;
    fromName: string;
    replyToEmail?: string;

    // Rate Limits
    dailyLimit?: number;
    hourlyLimit?: number;

    // Verification
    isVerified: boolean;
    verifiedAt?: Date;
    lastTestedAt?: Date;
    lastError?: string;

    createdById: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const MarketingProviderSchema = new Schema<IMarketingProvider>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        type: {
            type: String,
            enum: ['brevo', 'ses', 'smtp'],
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        isDefault: {
            type: Boolean,
            default: false,
        },
        credentials: {
            // Brevo
            apiKey: String,
            // SES
            accessKeyId: String,
            secretAccessKey: String,
            region: String,
            // SMTP
            host: String,
            port: Number,
            username: String,
            password: String,
            secure: Boolean,
        },
        fromEmail: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        fromName: {
            type: String,
            required: true,
            trim: true,
        },
        replyToEmail: {
            type: String,
            trim: true,
            lowercase: true,
        },
        dailyLimit: Number,
        hourlyLimit: Number,
        isVerified: {
            type: Boolean,
            default: false,
        },
        verifiedAt: Date,
        lastTestedAt: Date,
        lastError: String,
        createdById: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    {
        timestamps: true,
        collection: 'marketing_providers',
    }
);

// Indexes
MarketingProviderSchema.index({ type: 1 });
MarketingProviderSchema.index({ isDefault: 1 }); // To verify only one default per org

const MarketingProvider: Model<IMarketingProvider> =
    mongoose.models.MarketingProvider || mongoose.model<IMarketingProvider>('MarketingProvider', MarketingProviderSchema);

export default MarketingProvider;
