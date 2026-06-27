import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { companyRepository } from '@/lib/db/repository/crm/company.repository';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';
import { activityRepository } from '@/lib/db/repository/crm/activity.repository';
// import { organizationRepository } from '@/lib/db/repository/organization.repository';
import { getOrHealOrganization } from '@/lib/crm/auth-helper';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    const ctx = await getCrmPermissionContext(userId);
    assertCrmPermission(ctx, 'contact', 'read');

    // Get user's organization
    const user = await userRepository.findById(userId);
    let organizationId = user!.id?.toString();

    // Self-healing: Create organization if missing
    // if (!organizationId) {
    //   // Check if user is admin of any organization
    //   let org = await organizationRepository.findByAdminId(userId);

    //   if (!org) {
    //     // Create new organization
    //     org = await organizationRepository.create({
    //       name: `${user?.name || 'My'}'s Organization`,
    //       adminId: userId,
    //       memberLimit: 5,
    //     });
    //   }

    //   // Link user to organization
    //   if (org) {
    //     organizationId = org._id.toString();
    //     await userRepository.updateOrganization(userId, organizationId);
    //   }
    // }

    // Use shared helper
    organizationId = await getOrHealOrganization(userId, session.user.name || undefined);
    // Calculate date ranges
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Fetch all stats in parallel
    const [
      contactsTotal,
      contactsThisMonth,
      contactsLastMonth,
      companiesTotal,
      companiesThisMonth,
      companiesLastMonth,
      dealStats,
      dealStatsLastMonth,
      tasksStats,
    ] = await Promise.all([
      // Contacts
      contactRepository.countByOrganization(),
      contactRepository.find({ createdAfter: startOfMonth }).then(r => r.pagination.total),
      contactRepository.find({ createdAfter: startOfLastMonth, createdBefore: endOfLastMonth }).then(r => r.pagination.total),

      // Companies
      companyRepository.countByOrganization(),
      companyRepository.find({ createdAfter: startOfMonth }).then(r => r.pagination.total),
      companyRepository.find({ createdAfter: startOfLastMonth, createdBefore: endOfLastMonth }).then(r => r.pagination.total),

      // Deals
      dealRepository.getStats(),
      dealRepository.find({ status: ['won', 'lost'], createdAfter: startOfMonth }).then(r => {
        const won = r.data.filter(d => d.status === 'won');
        const lost = r.data.filter(d => d.status === 'lost');
        return {
          won: won.length,
          wonValue: won.reduce((sum, d) => sum + (d.value || 0), 0),
          lost: lost.length,
        };
      }),

      // Tasks
      activityRepository.find({ type: 'task' }).then(async (r) => {
        const now = new Date();
        const overdue = r.data.filter(a =>
          !a.completed &&
          a.dueDate &&
          new Date(a.dueDate) < now
        ).length;

        return {
          total: r.pagination.total,
          overdue,
        };
      }),
    ]);

    // Calculate percentage changes
    const calculateChange = (current: number, previous: number): { change: number; changeType: 'increase' | 'decrease' | 'neutral' } => {
      if (previous === 0) {
        return { change: current > 0 ? 100 : 0, changeType: current > 0 ? 'increase' : 'neutral' };
      }
      const percentChange = ((current - previous) / previous) * 100;
      return {
        change: Math.abs(percentChange),
        changeType: percentChange > 0 ? 'increase' : percentChange < 0 ? 'decrease' : 'neutral',
      };
    };

    const contactsChange = calculateChange(contactsThisMonth, contactsLastMonth);
    const companiesChange = calculateChange(companiesThisMonth, companiesLastMonth);

    // Build response
    const stats = {
      contacts: {
        total: contactsTotal,
        thisMonth: contactsThisMonth,
        change: contactsChange.change,
        changeType: contactsChange.changeType,
      },
      companies: {
        total: companiesTotal,
        thisMonth: companiesThisMonth,
        change: companiesChange.change,
        changeType: companiesChange.changeType,
      },
      activeDeals: {
        count: dealStats.open,
        value: dealStats.totalValue - dealStats.wonValue,
      },
      wonDeals: {
        count: dealStatsLastMonth.won,
        value: dealStatsLastMonth.wonValue,
      },
      lostDeals: {
        count: dealStatsLastMonth.lost,
      },
      tasks: {
        total: tasksStats.total,
        overdue: tasksStats.overdue,
      },
    };

    return NextResponse.json(stats);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching CRM stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
