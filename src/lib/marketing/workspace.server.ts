import { getSession } from '@/lib/get-session';
import { brandRepository } from '@/lib/db/repository/brand.repository';
import { canvasRepository } from '@/lib/db/repository/canvas.repository';
import { marketingPlanRepository } from '@/lib/db/repository/marketing-plan.repository';
import MarketingCampaign from '@/lib/db/models/marketing-email/campaign.model';
import MarketingProvider from '@/lib/db/models/marketing-email/provider.model';
import WhatsAppAccount from '@/lib/db/models/whatsapp-account.model';
import WhatsAppCampaign from '@/lib/db/models/whatsapp-campaign.model';
import WhatsAppConversation from '@/lib/db/models/whatsapp-conversation.model';
import { CrossChannelAnalyticsService } from '@/lib/services/cross-channel-analytics';
import { buildMarketingWorkspace, type MarketingWorkspace } from './workspace';

export interface MarketingRecentAutomation {
  id: string;
  name: string;
  updatedAt: string;
  executionCount: number;
  isActive: boolean;
}

export interface MarketingRecentEmailCampaign {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  sent: number;
  openRate: number;
  clickRate: number;
}

export interface MarketingRecentWhatsAppCampaign {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  sent: number;
  deliveryRate: number;
  readRate: number;
}

export interface MarketingBrandSummary {
  id: string;
  name: string;
  handle: string;
}

export interface MarketingWorkspaceData {
  workspace: MarketingWorkspace;
  activeBrand: MarketingBrandSummary | null;
  brands: MarketingBrandSummary[];
  recentAutomations: MarketingRecentAutomation[];
  recentEmailCampaigns: MarketingRecentEmailCampaign[];
  recentWhatsAppCampaigns: MarketingRecentWhatsAppCampaign[];
  connectedProviders: number;
  connectedWhatsAppAccounts: number;
  openWhatsAppConversations: number;
  totalAutomations: number;
  activeAutomations: number;
}

export async function getMarketingWorkspaceData(): Promise<MarketingWorkspaceData | null> {
  const session = await getSession();

  if (!session?.user?.id) {
    return null;
  }

  const organizationId = session.user.id || session.user.id;
  const firebaseUid = (session.user as { firebaseUid?: string }).firebaseUid;

  const brands = await brandRepository.findAccessibleBrands(session.user.id);
  const activeBrandDoc = brands[0] ?? null;
  const activeBrand = activeBrandDoc
    ? {
        id: activeBrandDoc._id.toString(),
        name: activeBrandDoc.name,
        handle: activeBrandDoc.handle,
      }
    : null;

  const [canvases, report, roadmap, recentEmailDocs, recentWhatsAppDocs, connectedProviders, connectedWhatsAppAccounts, openWhatsAppConversations] = await Promise.all([
    canvasRepository.findByUserId(session.user.id, 'updatedAt', firebaseUid),
    activeBrand
      ? CrossChannelAnalyticsService.getReport(activeBrand.id, organizationId, '30d')
      : Promise.resolve(null),
    activeBrand
      ? marketingPlanRepository.findByUserAndBrand(session.user.id, activeBrand.id)
      : Promise.resolve(null),
    MarketingCampaign.find({ }).sort({ updatedAt: -1 }).limit(4).lean(),
    WhatsAppCampaign.find({ }).sort({ updatedAt: -1 }).limit(4).lean(),
    MarketingProvider.countDocuments({ }),
    WhatsAppAccount.countDocuments({ }),
    WhatsAppConversation.countDocuments({ status: { $in: ['open', 'pending'] } }),
  ]);

  const totalAutomations = canvases.length;
  const activeAutomations = canvases.filter((canvas) => (canvas as { stats?: { isActive?: boolean } }).stats?.isActive).length;

  const recentAutomations = canvases.slice(0, 4).map((canvas) => ({
    id: canvas._id.toString(),
    name: canvas.name,
    updatedAt: canvas.updatedAt.toISOString(),
    executionCount: (canvas as { stats?: { executionCount?: number } }).stats?.executionCount || 0,
    isActive: Boolean((canvas as { stats?: { isActive?: boolean } }).stats?.isActive),
  }));

  const recentEmailCampaigns = recentEmailDocs.map((campaign) => {
    const sent = campaign.stats?.sent || 0;
    return {
      id: campaign._id.toString(),
      name: campaign.name,
      status: campaign.status,
      updatedAt: campaign.updatedAt?.toISOString() || campaign.createdAt?.toISOString() || new Date().toISOString(),
      sent,
      openRate: sent > 0 ? roundPercent((campaign.stats?.opened || 0) / sent) : 0,
      clickRate: sent > 0 ? roundPercent((campaign.stats?.clicked || 0) / sent) : 0,
    };
  });

  const recentWhatsAppCampaigns = recentWhatsAppDocs.map((campaign) => {
    const sent = campaign.stats?.sent || 0;
    const delivered = campaign.stats?.delivered || 0;
    return {
      id: campaign._id.toString(),
      name: campaign.name,
      status: campaign.status,
      updatedAt: campaign.updatedAt?.toISOString() || campaign.createdAt?.toISOString() || new Date().toISOString(),
      sent,
      deliveryRate: sent > 0 ? roundPercent(delivered / sent) : 0,
      readRate: delivered > 0 ? roundPercent((campaign.stats?.read || 0) / delivered) : 0,
    };
  });

  const workspace = buildMarketingWorkspace({
    brandName: activeBrand?.name || null,
    hasBrands: brands.length > 0,
    totalAutomations,
    activeAutomations,
    connectedProviders,
    connectedWhatsAppAccounts,
    openWhatsAppConversations,
    report,
    roadmap: roadmap
      ? {
          currentLevel: roadmap.currentLevel,
          currentXp: roadmap.currentXp,
          tasks: roadmap.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            xpReward: task.xpReward,
            type: task.type,
            description: task.description,
          })),
        }
      : null,
  });

  return {
    workspace,
    activeBrand,
    brands: brands.slice(0, 4).map((brand) => ({
      id: brand._id.toString(),
      name: brand.name,
      handle: brand.handle,
    })),
    recentAutomations,
    recentEmailCampaigns,
    recentWhatsAppCampaigns,
    connectedProviders,
    connectedWhatsAppAccounts,
    openWhatsAppConversations,
    totalAutomations,
    activeAutomations,
  };
}

function roundPercent(value: number): number {
  return Math.round(value * 1000) / 10;
}

