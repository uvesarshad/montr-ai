import { NextResponse } from 'next/server';
import { userRepository } from '@/lib/db/repository/user.repository';
import { whatsappConversationRepository } from '@/lib/db/repository/whatsapp-conversation.repository';
import { getWhatsAppContext, requirePermissionOrFail, WhatsAppApiErrors } from '@/lib/whatsapp/api-middleware';

/**
 * Assign conversation to agent
 * POST /api/whatsapp/conversations/[id]/assign
 *
 * Permissions:
 * - Admin: Can assign any conversation to any agent
 * - Agent: Can assign conversations they have access to
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Authenticate and get context
  const context = await getWhatsAppContext();
  if (context instanceof NextResponse) return context;

  // Check permission
  const permissionError = requirePermissionOrFail(context, 'canAssignConversations');
  if (permissionError) return permissionError;

  try {
    const { agentId } = await request.json();

    if (!agentId) {
      return WhatsAppApiErrors.badRequest('Agent ID is required');
    }

    // Verify agent belongs to organization
    const agent = await userRepository.findById(agentId);

    if (!agent) {
      return WhatsAppApiErrors.notFound('Agent');
    }

    // Get conversation first to check access
    const existingConversation = await whatsappConversationRepository.findById(params.id);

    if (!existingConversation) {
      return WhatsAppApiErrors.notFound('Conversation');
    }

    // Check if conversation belongs to organization
    // Agents can only assign conversations they have access to
    if (context.isAgent) {
      const hasAccess =
        !existingConversation.assignedToId ||
        existingConversation.assignedToId.toString() === context.userId;

      if (!hasAccess) {
        return WhatsAppApiErrors.forbidden('You can only assign conversations that are assigned to you or unassigned');
      }
    }

    // Assign conversation
    const conversation = await whatsappConversationRepository.assignToAgent(
      params.id,
      agentId,
      context.userId
    );

    return NextResponse.json({
      message: 'Conversation assigned successfully',
      data: conversation,
    });
  } catch (error) {
    console.error('Error assigning conversation:', error);
    return WhatsAppApiErrors.serverError((error instanceof Error ? error.message : String(error)));
  }
}
