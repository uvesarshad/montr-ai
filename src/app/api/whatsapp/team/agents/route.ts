import { NextResponse } from 'next/server';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getWhatsAppContext, WhatsAppApiErrors } from '@/lib/whatsapp/api-middleware';

/**
 * Get list of agents in organization for assignment
 * GET /api/whatsapp/team/agents
 *
 * Permissions:
 * - All users can see list of agents for assignment
 *
 * Query params:
 * - includeStats: boolean (include agent workload stats)
 */
export async function GET(request: Request) {
  // Authenticate and get context
  const context = await getWhatsAppContext();
  if (context instanceof NextResponse) return context;

  try {
    const { searchParams } = new URL(request.url);
    const includeStats = searchParams.get('includeStats') === 'true';

    const users = await userRepository.findByOrganization();

    if (!users || users.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const agents = users.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      image: user.image,
      role: user.role,
      isAdmin: user.role === 'admin' || user.role === 'super_admin',
      isAgent: user.role === 'user',
    }));

    // If stats requested, add workload info (would need to fetch from conversation repo)
    if (includeStats) {
      // TODO: Add workload statistics
      // This would require querying conversation repository for each agent
      // For now, return basic agent list
    }

    return NextResponse.json({
      data: agents,
      total: agents.length,
    });
  } catch (error) {
    console.error('Error fetching agents:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch agents';
    return WhatsAppApiErrors.serverError(message);
  }
}
