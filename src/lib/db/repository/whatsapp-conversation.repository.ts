import WhatsAppConversation, {
  IWhatsAppConversation,
} from '@/lib/db/models/whatsapp-conversation.model';
import { connectDB } from '@/lib/mongodb';
import { FilterQuery, Types } from 'mongoose';

class WhatsAppConversationRepository {
  private async ensureConnection() {
    await connectDB();
  }

  async create(data: Partial<IWhatsAppConversation>): Promise<IWhatsAppConversation> {
    await this.ensureConnection();
    const conversation = new WhatsAppConversation(data);
    return conversation.save();
  }

  async findById(id: string): Promise<IWhatsAppConversation | null> {
    await this.ensureConnection();
    return WhatsAppConversation.findById(id)
      .populate('assignedToId', 'name email')
      .populate('assignedById', 'name email');
  }

  async findByContactId(contactId: string, accountId: string): Promise<IWhatsAppConversation | null> {
    await this.ensureConnection();
    return WhatsAppConversation.findOne({ contactId, accountId })
      .populate('assignedToId', 'name email')
      .populate('assignedById', 'name email');
  }

  async find(filter: FilterQuery<IWhatsAppConversation>): Promise<IWhatsAppConversation[]> {
    await this.ensureConnection();
    return WhatsAppConversation.find(filter)
      .populate('assignedToId', 'name email')
      .populate('assignedById', 'name email')
      .sort({ lastMessageAt: -1 });
  }

  async update(id: string, data: Partial<IWhatsAppConversation>): Promise<IWhatsAppConversation | null> {
    await this.ensureConnection();
    return WhatsAppConversation.findByIdAndUpdate(id, data, { new: true })
      .populate('assignedToId', 'name email')
      .populate('assignedById', 'name email');
  }

  async upsertByContactAndAccount(
    filter: {
      accountId: string;
      contactId: string;
    },
    updates: Partial<IWhatsAppConversation>,
    defaults: Partial<IWhatsAppConversation>
  ): Promise<IWhatsAppConversation | null> {
    await this.ensureConnection();
    return WhatsAppConversation.findOneAndUpdate(
      filter,
      {
        $set: updates,
        $setOnInsert: defaults,
      },
      {
        new: true,
        upsert: true,
      }
    )
      .populate('assignedToId', 'name email')
      .populate('assignedById', 'name email');
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await WhatsAppConversation.findByIdAndDelete(id);
    return !!result;
  }

  async assignToAgent(
    conversationId: string,
    agentId: string,
    assignedById: string
  ): Promise<IWhatsAppConversation | null> {
    await this.ensureConnection();
    return WhatsAppConversation.findByIdAndUpdate(
      conversationId,
      {
        assignedToId: new Types.ObjectId(agentId),
        assignedAt: new Date(),
        assignedById: new Types.ObjectId(assignedById),
      },
      { new: true }
    ).populate('assignedToId', 'name email');
  }

  async updateStatus(
    conversationId: string,
    status: 'open' | 'pending' | 'resolved' | 'closed'
  ): Promise<IWhatsAppConversation | null> {
    await this.ensureConnection();
    return WhatsAppConversation.findByIdAndUpdate(
      conversationId,
      { status },
      { new: true }
    );
  }

  async updatePriority(
    conversationId: string,
    priority: 'low' | 'medium' | 'high' | 'urgent'
  ): Promise<IWhatsAppConversation | null> {
    await this.ensureConnection();
    return WhatsAppConversation.findByIdAndUpdate(
      conversationId,
      { priority },
      { new: true }
    );
  }

  async getAgentWorkload(
    agentId?: string
  ): Promise<{
    agentId: string;
    agentName: string;
    totalConversations: number;
    openConversations: number;
    pendingConversations: number;
    averageResponseTime: number;
  }[]> {
    await this.ensureConnection();

    const matchStage: Record<string, unknown> = {
      assignedToId: { $exists: true, $ne: null },
      status: { $in: ['open', 'pending'] },
    };

    if (agentId) {
      matchStage.assignedToId = new Types.ObjectId(agentId);
    }

    const result = await WhatsAppConversation.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$assignedToId',
          totalConversations: { $sum: 1 },
          openConversations: {
            $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] },
          },
          pendingConversations: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
          },
          averageResponseTime: { $avg: '$averageResponseTime' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'agent',
        },
      },
      {
        $unwind: '$agent',
      },
      {
        $project: {
          agentId: '$_id',
          agentName: '$agent.name',
          totalConversations: 1,
          openConversations: 1,
          pendingConversations: 1,
          averageResponseTime: { $round: ['$averageResponseTime', 0] },
        },
      },
    ]);

    return result.map((r) => ({
      agentId: r.agentId.toString(),
      agentName: r.agentName,
      totalConversations: r.totalConversations,
      openConversations: r.openConversations,
      pendingConversations: r.pendingConversations,
      averageResponseTime: r.averageResponseTime || 0,
    }));
  }

  async getUnassignedConversations(accountId?: string): Promise<IWhatsAppConversation[]> {
    await this.ensureConnection();

    const filter: FilterQuery<IWhatsAppConversation> = {
      $or: [{ assignedToId: { $exists: false } }, { assignedToId: null }],
      status: { $in: ['open', 'pending'] },
    };

    if (accountId) {
      filter.accountId = accountId;
    }

    return WhatsAppConversation.find(filter).sort({ lastMessageAt: -1 }).limit(50);
  }
}

export const whatsappConversationRepository = new WhatsAppConversationRepository();
