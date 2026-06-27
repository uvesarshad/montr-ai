'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

import { getMarketingPlan } from '@/app/actions/marketing-plan';
import { OnboardingModalWrapper } from '@/components/marketing/onboarding-modal-wrapper';
import { useAppHeader } from '@/components/app-header';
import { useCanvases } from '@/hooks/use-canvases-v2';
import { useDocuments } from '@/hooks/use-documents-v2';
import { useForms } from '@/hooks/use-forms';
import { useDeals } from '@/hooks/crm/use-deals';
import { useCredits } from '@/hooks/use-credits';
import { openAgentLauncher } from '@/lib/agent/launcher';
import { IMarketingPlan } from '@/lib/db/models/marketing-plan.model';
import type { AnalyticsSummarySnapshot } from '@/lib/social/analytics-insights';
import {
  DashboardHome,
  type AgentTask,
  type AutomationRow,
  type DocFormRow,
  type PipelineRow,
  type ScheduledPost,
} from './dashboard-home';

type BrandPreview = { _id: string; name: string };

type AgentMission = {
  _id: string;
  title: string;
  summary?: string;
  status: 'draft' | 'active' | 'waiting' | 'scheduled' | 'blocked' | 'completed';
  messageCount?: number;
  eventCount?: number;
};
type AgentMissionResponse = { missions: AgentMission[]; total: number; statusCounts: Record<string, number> };
type ScheduledPostPreview = { _id: string; content?: string; scheduledFor: string | Date };

const DEAL_FILTERS = { limit: 100, sort: '-updatedAt' };
const STAGE_COLORS = [
  'hsl(var(--muted-foreground))',
  'hsl(var(--info-h))',
  'hsl(var(--brand-strong))',
  'hsl(var(--brand))',
  'hsl(var(--success))',
];

const fmtCompact = (n: number) =>
  Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);

function missionProgress(m: AgentMission) {
  if (m.status === 'completed') return 100;
  if (m.status === 'waiting' || m.status === 'scheduled') return 0;
  if (m.status === 'blocked') return 12;
  return Math.max(18, Math.min(88, (m.eventCount || m.messageCount || 2) * 11));
}

function missionChip(status: AgentMission['status']): { label: string; tone: AgentTask['tone'] } {
  switch (status) {
    case 'active':
      return { label: 'RUNNING', tone: 'brand' };
    case 'waiting':
    case 'scheduled':
      return { label: 'QUEUED', tone: 'gray' };
    case 'completed':
      return { label: 'DONE', tone: 'ok' };
    case 'blocked':
      return { label: 'BLOCKED', tone: 'gray' };
    default:
      return { label: 'READY', tone: 'ok' };
  }
}

// `useSearchParams` requires a Suspense boundary in Next 15 — same pattern
// as settings/page.tsx.
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const { data: session } = useSession();
  const { push: routerPush, replace: routerReplace } = useRouter();
  const searchParams = useSearchParams();
  const { setHeaderInfo } = useAppHeader();

  const [marketingPlan, setMarketingPlan] = useState<IMarketingPlan | null | undefined>(undefined);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [activeBrandId, setActiveBrandId] = useState('');

  const firstName = session?.user?.name?.split(' ')[0] || 'there';
  const dateLabel = format(new Date(), 'EEEE, MMMM d');

  const { data: brandsData } = useQuery<{ brands?: BrandPreview[] }>({
    queryKey: ['dashboard-brands'],
    queryFn: async () => {
      const response = await fetch('/api/social/brands');
      if (!response.ok) throw new Error('Failed to fetch brands');
      return response.json();
    },
  });

  useEffect(() => {
    const nextBrands = brandsData?.brands || [];
    if (!activeBrandId && nextBrands.length > 0) {
      setActiveBrandId(nextBrands[0]._id);
    }
  }, [brandsData, activeBrandId]);

  useEffect(() => {
    setHeaderInfo({ type: 'page', title: 'Dashboard' });
    return () => setHeaderInfo(null);
  }, [setHeaderInfo]);

  // "Replay onboarding" (rail account menu) lands here with ?onboarding=replay.
  useEffect(() => {
    if (searchParams.get('onboarding') === 'replay') {
      setIsOnboardingOpen(true);
      routerReplace('/dashboard');
    }
  }, [searchParams, routerReplace]);

  const refreshPlan = useCallback(() => {
    if (!activeBrandId) return;
    getMarketingPlan(activeBrandId)
      .then((data) => {
        const { plan, hasSeenOnboarding } = data;
        setMarketingPlan(plan);
        if (plan && !plan.onboardingCompleted && !hasSeenOnboarding) {
          setIsOnboardingOpen(true);
        } else if (plan === null && !hasSeenOnboarding) {
          setIsOnboardingOpen(true);
        }
      })
      .catch(console.error);
  }, [activeBrandId]);

  useEffect(() => {
    if (activeBrandId) refreshPlan();
  }, [activeBrandId, refreshPlan]);

  // ---- data sources ----
  const { canvases } = useCanvases('updatedAt');
  const { documents } = useDocuments('updatedAt');
  const { forms } = useForms();
  const { deals } = useDeals(DEAL_FILTERS);
  const { credits } = useCredits();

  const { data: missionsData } = useQuery<AgentMissionResponse>({
    queryKey: ['dashboard-agent-missions', activeBrandId],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '3' });
      if (activeBrandId) params.set('brandId', activeBrandId);
      const response = await fetch(`/api/v2/agent/missions?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch missions');
      return response.json();
    },
  });

  const { data: postsData } = useQuery<{ posts?: ScheduledPostPreview[] }>({
    queryKey: ['dashboard-social-posts'],
    queryFn: async () => {
      const response = await fetch('/api/social/posts/scheduled');
      if (!response.ok) throw new Error('Failed to fetch scheduled posts');
      return response.json();
    },
  });

  const { data: socialAnalyticsData } = useQuery<{ summary: AnalyticsSummarySnapshot }>({
    queryKey: ['dashboard-social-analytics', activeBrandId],
    enabled: Boolean(activeBrandId),
    queryFn: async () => {
      const now = new Date();
      const fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const response = await fetch(
        `/api/social/analytics?brandId=${activeBrandId}&view=summary&fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(now.toISOString())}`,
      );
      if (!response.ok) throw new Error('Failed to fetch social analytics');
      return { summary: await response.json() };
    },
  });

  // ---- derive ui-kit props from real data (sample fallback inside DashboardHome) ----
  const home = useMemo(() => {
    const allDeals = (deals || []) as Array<{ value?: number; status?: string; stageName?: string }>;
    const open = allDeals.filter((d) => d.status === 'open');
    const pipelineValue = open.reduce((s, d) => s + (d.value || 0), 0);
    const wonValue = allDeals.filter((d) => d.status === 'won').reduce((s, d) => s + (d.value || 0), 0);

    const stageMap = new Map<string, number>();
    for (const d of open) {
      const name = d.stageName || 'Unstaged';
      stageMap.set(name, (stageMap.get(name) || 0) + (d.value || 0));
    }
    const crmPipeline: PipelineRow[] = Array.from(stageMap.entries())
      .slice(0, 5)
      .map(([name, total], i) => ({ name, total: Math.round(total / 1000), color: STAGE_COLORS[i % STAGE_COLORS.length] }));

    const creditSegments = credits
      ? [
        { value: credits.usageByType.text, color: 'hsl(var(--brand))', label: 'Text' },
        { value: credits.usageByType.image, color: 'hsl(var(--brand-strong))', label: 'Image' },
        { value: credits.usageByType.video, color: 'hsl(var(--info-h))', label: 'Video' },
        { value: credits.usageByType.scraping, color: 'hsl(var(--success))', label: 'Scraping' },
      ].filter((s) => s.value > 0)
      : undefined;

    const counts = missionsData?.statusCounts || {};
    const agentTasks: AgentTask[] = (missionsData?.missions || []).slice(0, 3).map((m) => {
      const chip = missionChip(m.status);
      return { status: chip.label, tone: chip.tone, title: m.title, tags: m.summary || 'Agent mission', pct: missionProgress(m) };
    });

    const canvasList = canvases || [];
    const automations: AutomationRow[] = canvasList.slice(0, 4).map((c) => ({
      title: c.name || 'Untitled automation',
      active: Boolean(c.stats?.isActive),
      runs: c.stats?.executionCount ? fmtCompact(c.stats.executionCount) : '—',
    }));
    const activeCanvas = canvasList.filter((c) => c.stats?.isActive).length;

    const docsAndForms: DocFormRow[] = [
      ...(documents || []).slice(0, 2).map((d) => ({ title: d.title || 'Untitled', sub: 'Document', badge: 'Doc', tone: 'purple' as const })),
      ...(forms || []).slice(0, 2).map((f) => ({ title: f.title || 'Untitled form', sub: 'Form', badge: 'Form', tone: 'gray' as const })),
    ];

    const summary = socialAnalyticsData?.summary;
    const socialStats = summary
      ? {
        impressions: fmtCompact(summary.totalImpressions),
        engagements: fmtCompact(summary.totalLikes + summary.totalComments + summary.totalShares),
        ctr: `${summary.avgEngagementRate.toFixed(1)}%`,
        published: String(summary.totalPosts),
      }
      : undefined;

    const scheduledPosts: ScheduledPost[] = (postsData?.posts || []).slice(0, 2).map((p) => ({
      title: (p.content || 'Scheduled post').slice(0, 42),
      date: format(new Date(p.scheduledFor), 'MMM d'),
    }));

    return {
      kpis: {
        pipeline: `$${fmtCompact(pipelineValue)}`,
        won: `$${fmtCompact(wonValue)}`,
        conversations: '—',
        credits: credits ? fmtCompact(credits.totalUsed) : '—',
      },
      creditSegments,
      creditsLeftLabel: credits ? fmtCompact(credits.remaining) : undefined,
      resetsLabel: credits?.periodEnd ? format(new Date(credits.periodEnd), 'MMM d') : undefined,
      agentTasks,
      agentSummary: { running: counts.active || 0, queued: (counts.waiting || 0) + (counts.scheduled || 0) },
      crmPipeline,
      crmOpenLabel: `$${fmtCompact(pipelineValue)} open`,
      crmDealsLabel: `${open.length} open · ${allDeals.length} total`,
      automations,
      automationsSummary: { active: activeCanvas, paused: Math.max(canvasList.length - activeCanvas, 0) },
      docsAndForms,
      docsFormsSummary: `${(documents || []).length} docs · ${(forms || []).length} forms`,
      socialStats,
      scheduledPosts,
    };
  }, [deals, credits, missionsData, canvases, documents, forms, socialAnalyticsData, postsData]);

  const launchAgent = (source: string) =>
    openAgentLauncher({
      prompt:
        'Review my dashboard and propose the highest-value next actions across automation, CRM, social, docs, forms, and AI Studio.',
      context: { source, route: '/dashboard', entityType: 'workspace', entityLabel: 'Dashboard' },
    });

  return (
    <>
      <OnboardingModalWrapper
        initialPlan={marketingPlan}
        onPlanComplete={refreshPlan}
        isOpen={isOnboardingOpen}
        onOpenChange={setIsOnboardingOpen}
        brandId={activeBrandId}
      />
      <DashboardHome
        firstName={firstName}
        dateLabel={dateLabel}
        onGo={(href) => routerPush(href)}
        onAskAI={() => launchAgent('dashboard_ask_ai')}
        onLaunchAgent={() => launchAgent('dashboard_header')}
        {...home}
      />
    </>
  );
}
