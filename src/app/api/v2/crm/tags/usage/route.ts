import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { Types } from 'mongoose';

/**
 * GET /api/v2/crm/tags/usage
 * Get usage statistics for all tags
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }

    const organizationId = user.id!.toString();

    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'read');
    const orgObjectId = new Types.ObjectId(organizationId);

    // Import models
    const { default: CrmTag } = await import('@/lib/db/models/crm/tag.model');
    const { default: CrmContact } = await import('@/lib/db/models/crm/contact.model');
    const { default: CrmCompany } = await import('@/lib/db/models/crm/company.model');
    const { default: CrmDeal } = await import('@/lib/db/models/crm/deal.model');
    await import('@/lib/mongodb').then(m => m.connectMongoose());

    // Get all tags
    const tags = await CrmTag.find({ }).exec();

    // Calculate actual usage for each tag
    const usageStats = await Promise.all(
      tags.map(async (tag) => {
        const tagId = tag._id;

        const [contactCount, companyCount, dealCount] = await Promise.all([
          CrmContact.countDocuments({ tags: tagId }).exec(),
          CrmCompany.countDocuments({ tags: tagId }).exec(),
          CrmDeal.countDocuments({ tags: tagId }).exec(),
        ]);

        const totalUsage = contactCount + companyCount + dealCount;

        return {
          tagId: tag._id.toString(),
          name: tag.name,
          color: tag.color,
          type: tag.type,
          usage: {
            contacts: contactCount,
            companies: companyCount,
            deals: dealCount,
            total: totalUsage,
          },
          storedUsageCount: tag.usageCount,
        };
      })
    );

    // Sort by total usage descending
    usageStats.sort((a, b) => b.usage.total - a.usage.total);

    return NextResponse.json({
      data: usageStats,
      total: usageStats.length,
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching tag usage:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tag usage', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
