import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { whatsappConversationRepository } from '@/lib/db/repository/whatsapp-conversation.repository';

/**
 * Get team workload statistics
 * GET /api/whatsapp/team/workload
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;

  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');

    // Get workload statistics
    const workload = await whatsappConversationRepository.getAgentWorkload(
      agentId || undefined
    );

    // Get unassigned conversations
    const unassigned = await whatsappConversationRepository.getUnassignedConversations(
);

    return NextResponse.json({
      data: {
        agents: workload,
        unassignedCount: unassigned.length,
        unassignedConversations: unassigned,
      },
    });
  } catch (error) {
    console.error('Error fetching team workload:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch team workload';
    return NextResponse.json(
      { error: 'Failed to fetch team workload', details: message },
      { status: 500 }
    );
  }
}
