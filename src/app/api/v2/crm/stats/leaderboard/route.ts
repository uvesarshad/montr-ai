import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';
import { activityRepository } from '@/lib/db/repository/crm/activity.repository';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    const ctx = await getCrmPermissionContext(userId);
    assertCrmPermission(ctx, 'contact', 'read');
    // Get period from query params
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'month'; // week, month, quarter, year

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'quarter':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        startDate = new Date(now);
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      case 'month':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    // Get all won deals in the period
    const wonDeals = await dealRepository.find(
      {
        status: 'won',
        createdAfter: startDate,
      },
      { limit: 10000 }
    );

    // Get all completed activities in the period
    const completedActivities = await activityRepository.find(
      {
        completed: true,
        createdAfter: startDate,
      },
      { limit: 10000 }
    );

    // Group by owner
    const userStats: Record<string, {
      userId: string;
      dealsWon: number;
      dealValue: number;
      dealsLost: number;
      activitiesCompleted: number;
    }> = {};

    // Process won deals
    wonDeals.data.forEach(deal => {
      const ownerId = deal.ownerId?.toString();
      if (ownerId) {
        if (!userStats[ownerId]) {
          userStats[ownerId] = {
            userId: ownerId,
            dealsWon: 0,
            dealValue: 0,
            dealsLost: 0,
            activitiesCompleted: 0,
          };
        }
        userStats[ownerId].dealsWon++;
        userStats[ownerId].dealValue += deal.value || 0;
      }
    });

    // Get lost deals for win rate calculation
    const lostDeals = await dealRepository.find(
      {
        status: 'lost',
        createdAfter: startDate,
      },
      { limit: 10000 }
    );

    lostDeals.data.forEach(deal => {
      const ownerId = deal.ownerId?.toString();
      if (ownerId) {
        if (!userStats[ownerId]) {
          userStats[ownerId] = {
            userId: ownerId,
            dealsWon: 0,
            dealValue: 0,
            dealsLost: 0,
            activitiesCompleted: 0,
          };
        }
        userStats[ownerId].dealsLost++;
      }
    });

    // Process completed activities
    completedActivities.data.forEach(activity => {
      const ownerId = activity.completedById?.toString() || activity.assignedTo?.toString();
      if (ownerId) {
        if (!userStats[ownerId]) {
          userStats[ownerId] = {
            userId: ownerId,
            dealsWon: 0,
            dealValue: 0,
            dealsLost: 0,
            activitiesCompleted: 0,
          };
        }
        userStats[ownerId].activitiesCompleted++;
      }
    });

    // Get user details and build leaderboard
    const userIds = Object.keys(userStats);
    const users = await Promise.all(
      userIds.map(id => userRepository.findById(id))
    );

    const leaderboard = userIds
      .map((userId, index) => {
        const stats = userStats[userId];
        const user = users[index];

        if (!user) return null;

        const totalDeals = stats.dealsWon + stats.dealsLost;
        const winRate = totalDeals > 0 ? (stats.dealsWon / totalDeals) * 100 : 0;

        return {
          userId,
          userName: user.name || 'Unknown User',
          userAvatar: user.image,
          dealsWon: stats.dealsWon,
          dealValue: stats.dealValue,
          activitiesCompleted: stats.activitiesCompleted,
          winRate,
          rank: 0, // Will be assigned after sorting
        };
      })
      .filter(entry => entry !== null)
      .sort((a, b) => {
        // Sort by deal value first, then by deals won
        if (b!.dealValue !== a!.dealValue) {
          return b!.dealValue - a!.dealValue;
        }
        return b!.dealsWon - a!.dealsWon;
      })
      .map((entry, index) => ({
        ...entry!,
        rank: index + 1,
      }))
      .slice(0, 10); // Top 10 only

    return NextResponse.json({ leaderboard, period });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}
