import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IBrandContext extends Document {
    brandId: string;              // ref: brands
    // === SOUL: Who the AI is ===
    agentName: string;            // "Luna", "Alex", or default "MontrAI Agent"
    personality: string;          // "Professional and concise" / "Friendly and casual"
    tone: string;                 // "Authoritative" / "Warm" / "Witty"
    languageStyle: string;        // "Use short sentences" / "Use marketing jargon"
    customInstructions: string;   // Free-form instructions the user wants the AI to follow

    // === CONTEXT: What the AI knows ===
    brandVoice: string;           // "We are a sustainable fashion brand targeting Gen Z..."
    targetAudience: string;       // "18-25 year olds interested in eco-friendly clothing"
    competitors: string[];        // ["Zara", "H&M", "Patagonia"]
    keyMessages: string[];        // ["Sustainability first", "Affordable luxury"]
    industry: string;             // "Fashion", "SaaS", "Restaurant"

    // === TOOLS: What the AI can do ===
    enabledTools: string[];       // ["createContact", "searchKnowledgeBase", "triggerWorkflow"]
    requireApproval: string[];    // ["sendWhatsApp", "triggerWorkflow"] — HITL tools
    maxBudgetPerSession: number;  // max credits per session

    // === VOICE CALL POLICY (D4 2026-06-05) ===
    // Governs HITL for outbound voice calls (initiate_call / schedule_call / bulk_call):
    //   always_ask        — every call needs approval regardless of mission mode (default)
    //   always_autonomous — calls are never gated (bypasses the danger list)
    //   conditional       — autonomous only when ALL configured conditions pass; otherwise gated
    voiceCallPolicy?: {
        mode: 'always_ask' | 'always_autonomous' | 'conditional';
        conditions?: {
            /** Call purposes allowed to run autonomously (e.g. ['reminder','follow_up']); pitches stay gated unless listed. */
            autonomousPurposes?: string[];
            /** Only known CRM contacts (resolvable contactRef) may be called autonomously. */
            knownContactsOnly?: boolean;
            /** Autonomous calls only between 09:00–18:00 UTC. */
            businessHoursOnly?: boolean;
        };
    };

    createdAt: Date;
    updatedAt: Date;
}

const BrandContextSchema = new Schema<IBrandContext>(
    {
        brandId: {
            type: String,
            required: true,
        },

        // SOUL
        agentName: {
            type: String,
            default: 'MontrAI Agent',
            trim: true,
        },
        personality: {
            type: String,
            default: 'You are a professional, proactive, and friendly marketing assistant.',
        },
        tone: {
            type: String,
            default: 'Professional',
        },
        languageStyle: {
            type: String,
            default: 'Clear and concise',
        },
        customInstructions: {
            type: String,
            default: '',
        },

        // CONTEXT
        brandVoice: {
            type: String,
            default: '',
        },
        targetAudience: {
            type: String,
            default: '',
        },
        competitors: {
            type: [String],
            default: [],
        },
        keyMessages: {
            type: [String],
            default: [],
        },
        industry: {
            type: String,
            default: '',
        },

        // TOOLS
        enabledTools: {
            type: [String],
            default: ['createContact', 'getContact', 'searchKnowledgeBase', 'triggerWorkflow'],
        },
        requireApproval: {
            type: [String],
            default: [],
        },
        maxBudgetPerSession: {
            type: Number,
            default: 100,
        },
        voiceCallPolicy: {
            type: new Schema({
                mode: {
                    type: String,
                    enum: ['always_ask', 'always_autonomous', 'conditional'],
                    default: 'always_ask',
                },
                conditions: {
                    autonomousPurposes: { type: [String], default: [] },
                    knownContactsOnly: { type: Boolean, default: true },
                    businessHoursOnly: { type: Boolean, default: true },
                },
            }, { _id: false }),
            default: undefined,
        },
    },
    {
        timestamps: true,
        collection: 'brand_contexts',
    }
);

// One context per brand
BrandContextSchema.index({ brandId: 1 }, { unique: true });
// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.BrandContext) {
        delete mongoose.models.BrandContext;
    }
}

const BrandContext: Model<IBrandContext> =
    mongoose.models.BrandContext || mongoose.model<IBrandContext>('BrandContext', BrandContextSchema);

export default BrandContext;
