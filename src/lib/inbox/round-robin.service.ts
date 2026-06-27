/**
 * Round-Robin Assignment Service
 * Automatically assigns conversations to agents in a round-robin fashion
 */

import InboxMember from '@/lib/db/models/inbox-member.model';
import InboxConversation from '@/lib/db/models/inbox-conversation.model';
import { Types } from 'mongoose';

interface AssignmentResult {
    assignedToId: Types.ObjectId;
    assignedToName?: string;
}

/**
 * Get next agent for round-robin assignment
 */
export async function getNextAgent(params: {
    channelId: Types.ObjectId;
}): Promise<AssignmentResult | null> {
    try {
        // Get all agents assigned to this channel
        const members = await InboxMember.find({
            channelId: params.channelId,
            role: 'agent',
        }).populate('userId');

        if (members.length === 0) {
            return null;
        }

        // Get conversation counts for each agent
        const agentCounts = await Promise.all(
            members.map(async (member) => {
                const count = await InboxConversation.countDocuments({
                    channelId: params.channelId,
                    assignedToId: member.userId,
                    status: { $in: ['open', 'pending'] }, // Only count active conversations
                });

                return {
                    userId: member.userId,
                    count,
                };
            })
        );

        // Find agent with least conversations
        const leastBusyAgent = agentCounts.reduce((min, current) =>
            current.count < min.count ? current : min
        );

        return {
            assignedToId: leastBusyAgent.userId,
        };
    } catch (error) {
        console.error('Error in round-robin assignment:', error);
        return null;
    }
}

/**
 * Auto-assign conversation using round-robin
 */
export async function autoAssignConversation(params: {
    conversationId: Types.ObjectId;
    channelId: Types.ObjectId;
}): Promise<boolean> {
    try {
        const nextAgent = await getNextAgent({
            channelId: params.channelId,
        });

        if (!nextAgent) {
            return false;
        }

        await InboxConversation.findByIdAndUpdate(params.conversationId, {
            assignedToId: nextAgent.assignedToId,
            assignedAt: new Date(),
            assignedById: nextAgent.assignedToId, // Auto-assigned
        });

        return true;
    } catch (error) {
        console.error('Error auto-assigning conversation:', error);
        return false;
    }
}
