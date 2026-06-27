import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IWhatsAppConversation extends Document {
  /** Agency-mode brand scope (B3-4.6.1). */
  brandId?: Types.ObjectId | null;
  accountId: Types.ObjectId;
  contactId: Types.ObjectId; // CRM contact ID

  // Assignment
  assignedToId?: Types.ObjectId; // User/agent ID
  assignedAt?: Date;
  assignedById?: Types.ObjectId; // Who assigned it

  /** Active AI bot for this conversation (B3-4.5.5). Suppressed when assignedToId is set. */
  aiBotId?: Types.ObjectId | null;

  // Status
  status: 'open' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';

  // Metrics
  firstResponseTime?: number; // Seconds
  averageResponseTime?: number; // Seconds
  totalMessages: number;
  lastMessageAt?: Date;
  lastMessageType?: 'incoming' | 'outgoing';

  // Tags and notes
  tags?: string[];
  internalNotes?: string;

  // SLA tracking
  slaDeadline?: Date;
  slaStatus?: 'on_track' | 'at_risk' | 'breached';

  createdAt: Date;
  updatedAt: Date;
}

const WhatsAppConversationSchema = new Schema<IWhatsAppConversation>(
  {
    brandId: {
      type: Schema.Types.ObjectId,
      ref: 'Brand',
      default: null,
      index: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'WhatsAppAccount',
      index: true,
    },
    contactId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    assignedToId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    assignedAt: Date,
    assignedById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    aiBotId: {
      type: Schema.Types.ObjectId,
      ref: 'AiBot',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['open', 'pending', 'resolved', 'closed'],
      default: 'open',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
      index: true,
    },
    firstResponseTime: Number,
    averageResponseTime: Number,
    totalMessages: {
      type: Number,
      default: 0,
    },
    lastMessageAt: Date,
    lastMessageType: {
      type: String,
      enum: ['incoming', 'outgoing'],
    },
    tags: [String],
    internalNotes: String,
    slaDeadline: Date,
    slaStatus: {
      type: String,
      enum: ['on_track', 'at_risk', 'breached'],
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
WhatsAppConversationSchema.index({ accountId: 1, contactId: 1 }, { unique: true });
WhatsAppConversationSchema.index({ assignedToId: 1, status: 1 });
WhatsAppConversationSchema.index({ status: 1, priority: -1 });
WhatsAppConversationSchema.index({ brandId: 1, status: 1 }); // B3-4.6.1

const WhatsAppConversation =
  mongoose.models.WhatsAppConversation ||
  mongoose.model<IWhatsAppConversation>('WhatsAppConversation', WhatsAppConversationSchema);

export default WhatsAppConversation;
