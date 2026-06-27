import type { Company, Contact, Deal, Pipeline } from '@/types/crm';

type InsightSeverity = 'high' | 'medium' | 'low';
type InsightTone = 'positive' | 'watch' | 'guarded';

interface OverviewStats {
  contacts: {
    total: number;
    thisMonth: number;
    change: number;
    changeType: 'increase' | 'decrease' | 'neutral';
  };
  companies: {
    total: number;
    thisMonth: number;
    change: number;
    changeType: 'increase' | 'decrease' | 'neutral';
  };
  activeDeals: {
    count: number;
    value: number;
  };
  wonDeals: {
    count: number;
    value: number;
  };
  lostDeals: {
    count: number;
  };
  tasks: {
    total: number;
    overdue: number;
  };
}

interface DealStats {
  byStage: Array<{
    stageId: string;
    stageName: string;
    count: number;
    value: number;
  }>;
}

export interface DashboardInsight {
  id: string;
  title: string;
  summary: string;
  metric: string;
  severity: InsightSeverity;
  href: string;
  actionLabel: string;
  prompt: string;
}

export interface ListInsight {
  id: string;
  title: string;
  summary: string;
  metric: string;
  actionLabel: string;
  prompt: string;
}

export interface ContactInsight {
  title: string;
  tone: InsightTone;
  summary: string;
  inferredSentiment: string;
  nextStep: string;
  evidence: string[];
  actionLabel: string;
  prompt: string;
}

export interface DealInsight {
  title: string;
  severity: InsightSeverity;
  summary: string;
  blocker: string;
  reasoning: string;
  nextStep: string;
  evidence: string[];
  actionLabel: string;
  prompt: string;
}

function daysSince(date: Date | string | undefined, now: Date): number | null {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  const diff = now.getTime() - parsed.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function fullContactName(contact: Contact): string {
  return `${contact.firstName} ${contact.lastName || ''}`.trim();
}

function getCurrentStageAgeDays(deal: Deal, now: Date): number | null {
  const activeStageEntry = [...deal.stageHistory]
    .reverse()
    .find((entry) => entry.stageId === deal.stageId && !entry.exitedAt);

  return daysSince(activeStageEntry?.enteredAt, now);
}

function normalizeValue(value: string | undefined): string {
  return value?.trim().toLowerCase() || '';
}

function getDuplicateGroupCount(values: string[]): number {
  const counts = new Map<string, number>();

  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return [...counts.values()].filter((count) => count > 1).length;
}

export function buildDashboardInsights(
  overviewStats: OverviewStats | null,
  dealStats: DealStats | null,
  periodLabel: string
): DashboardInsight[] {
  if (!overviewStats) {
    return [];
  }

  const insights: DashboardInsight[] = [];

  if (overviewStats.tasks.overdue > 0) {
    insights.push({
      id: 'overdue-follow-ups',
      title: 'Overdue follow-ups are blocking pipeline momentum',
      summary: `${overviewStats.tasks.overdue} overdue task${overviewStats.tasks.overdue === 1 ? '' : 's'} need attention before more revenue slips.`,
      metric: `${overviewStats.tasks.overdue} overdue`,
      severity: 'high',
      href: '/crm/activities?overdue=true',
      actionLabel: 'Recover Follow-Ups',
      prompt: `Review the ${overviewStats.tasks.overdue} overdue CRM follow-ups from ${periodLabel.toLowerCase()} and create a recovery plan with prioritized owner actions.`,
    });
  }

  const largestStage = dealStats?.byStage.reduce((largest, stage) => {
    if (!largest || stage.count > largest.count) {
      return stage;
    }
    return largest;
  }, dealStats.byStage[0]);

  if (largestStage && overviewStats.activeDeals.count > 0) {
    const stageShare = largestStage.count / overviewStats.activeDeals.count;
    if (stageShare >= 0.5 || overviewStats.lostDeals.count > overviewStats.wonDeals.count) {
      insights.push({
        id: 'pipeline-risk',
        title: 'Pipeline concentration needs intervention',
        summary: `${largestStage.count} of ${overviewStats.activeDeals.count} open deals are sitting in ${largestStage.stageName}, so progression risk is rising.`,
        metric: `${Math.round(stageShare * 100)}% in ${largestStage.stageName}`,
        severity: overviewStats.lostDeals.count > overviewStats.wonDeals.count ? 'high' : 'medium',
        href: `/crm/deals?stage=${largestStage.stageId}`,
        actionLabel: 'Review Stalled Deals',
        prompt: `Audit the deals concentrated in ${largestStage.stageName} and recommend the fastest actions to move them forward or close them out.`,
      });
    }
  }

  if (overviewStats.contacts.thisMonth > overviewStats.activeDeals.count) {
    const unworkedLeadCount = overviewStats.contacts.thisMonth - overviewStats.activeDeals.count;
    insights.push({
      id: 'lead-activation',
      title: 'New leads are arriving faster than deals are opening',
      summary: `${unworkedLeadCount} recently added contact${unworkedLeadCount === 1 ? '' : 's'} still need qualification and a clear next step.`,
      metric: `${unworkedLeadCount} unworked`,
      severity: 'medium',
      href: '/crm/contacts',
      actionLabel: 'Qualify Leads',
      prompt: `Review recent CRM contacts with no associated deal motion and prepare an outreach plus qualification plan for the highest-potential leads.`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: 'next-best-action',
      title: 'Pipeline is healthy enough to push for new wins',
      summary: 'No immediate risk flags were detected, so the best next move is to accelerate qualified opportunities and add fresh top-of-funnel coverage.',
      metric: `${overviewStats.activeDeals.count} active deals`,
      severity: 'low',
      href: '/crm/deals',
      actionLabel: 'Plan Next Actions',
      prompt: 'Review the current CRM pipeline and suggest the top three next actions to increase close velocity this week.',
    });
  }

  return insights.sort((left, right) => {
    const order: Record<InsightSeverity, number> = { high: 0, medium: 1, low: 2 };
    return order[left.severity] - order[right.severity];
  });
}

export function buildContactListInsights(contacts: Contact[]): ListInsight[] {
  const duplicateGroups = getDuplicateGroupCount([
    ...contacts.map((contact) => normalizeValue(contact.email)),
    ...contacts.map((contact) => normalizeValue(contact.phone)),
  ]);
  const enrichmentCandidates = contacts.filter((contact) => !contact.jobTitle || !contact.companyId).length;
  const insights: ListInsight[] = [];

  if (duplicateGroups > 0) {
    insights.push({
      id: 'contact-dedupe',
      title: 'Possible duplicate contacts detected',
      summary: `${duplicateGroups} duplicate cluster${duplicateGroups === 1 ? '' : 's'} share the same email or phone and should be reviewed before new outreach is sent.`,
      metric: `${duplicateGroups} duplicate cluster${duplicateGroups === 1 ? '' : 's'}`,
      actionLabel: 'Review Duplicates',
      prompt: 'Review the current CRM contact list for duplicate emails or phone numbers and propose safe merge recommendations with a confidence explanation.',
    });
  }

  if (enrichmentCandidates > 0) {
    insights.push({
      id: 'contact-enrichment',
      title: 'Lead enrichment opportunities are available',
      summary: `${enrichmentCandidates} contact${enrichmentCandidates === 1 ? '' : 's'} on this page are missing company or role context, which weakens qualification and personalization.`,
      metric: `${enrichmentCandidates} enrichment candidate${enrichmentCandidates === 1 ? '' : 's'}`,
      actionLabel: 'Plan Enrichment',
      prompt: 'Review the current CRM contact list and suggest the best enrichment workflow for contacts missing job title, company context, or qualification details.',
    });
  }

  return insights;
}

export function buildCompanyListInsights(companies: Company[]): ListInsight[] {
  const duplicateGroups = getDuplicateGroupCount([
    ...companies.map((company) => normalizeValue(company.domain)),
    ...companies.map((company) => normalizeValue(company.name)),
  ]);
  const enrichmentCandidates = companies.filter(
    (company) => !company.industry || !company.website || !company.size
  ).length;
  const insights: ListInsight[] = [];

  if (duplicateGroups > 0) {
    insights.push({
      id: 'company-dedupe',
      title: 'Account dedupe review is needed',
      summary: `${duplicateGroups} company cluster${duplicateGroups === 1 ? '' : 's'} share the same name or domain and should be merged before pipeline reporting drifts.`,
      metric: `${duplicateGroups} duplicate cluster${duplicateGroups === 1 ? '' : 's'}`,
      actionLabel: 'Review Duplicates',
      prompt: 'Review the current CRM company list for duplicate names or domains and propose merge recommendations that preserve account history.',
    });
  }

  if (enrichmentCandidates > 0) {
    insights.push({
      id: 'company-enrichment',
      title: 'Company records need richer firmographic context',
      summary: `${enrichmentCandidates} account${enrichmentCandidates === 1 ? '' : 's'} are missing industry, website, or size details that sales workflows rely on.`,
      metric: `${enrichmentCandidates} enrichment candidate${enrichmentCandidates === 1 ? '' : 's'}`,
      actionLabel: 'Plan Enrichment',
      prompt: 'Review the current CRM companies and suggest the best enrichment workflow for missing industry, website, and company-size data.',
    });
  }

  return insights;
}

export function buildContactInsight(contact: Contact, now: Date = new Date()): ContactInsight {
  const fullName = fullContactName(contact);
  const lastTouch =
    contact.lastContactedAt ||
    contact.lastEmailAt ||
    contact.lastActivityAt ||
    contact.lastCalendarEventAt;
  const idleDays = daysSince(lastTouch, now);

  if (contact.doNotContact) {
    return {
      title: 'Outreach is blocked until consent is reviewed',
      tone: 'guarded',
      summary: `${fullName} is marked do-not-contact, so automated outreach should pause until consent is confirmed.`,
      inferredSentiment: 'Guarded',
      nextStep: 'Review consent history and switch to internal account planning before sending anything new.',
      evidence: ['Do not contact is enabled', `Lifecycle is ${contact.lifecycle}`],
      actionLabel: 'Review In Agent',
      prompt: `Review the CRM record for ${fullName}, who is marked do-not-contact, and suggest compliant internal next steps without sending outreach.`,
    };
  }

  const tone: InsightTone =
    contact.rating === 'hot' && idleDays !== null && idleDays <= 5
      ? 'positive'
      : idleDays !== null && idleDays >= 10
        ? 'watch'
        : 'positive';

  const summary = idleDays === null
    ? `No recent interaction is recorded for ${fullName}, so this lead still needs qualification and a fresh opening touch.`
    : idleDays >= 10
      ? `${fullName} has been quiet for ${idleDays} days, which usually means deal energy is starting to cool.`
      : `${fullName} was contacted ${idleDays} day${idleDays === 1 ? '' : 's'} ago and still has enough momentum for a direct next-step ask.`;

  const nextStep = idleDays !== null && idleDays >= 10
    ? 'Send a concise follow-up that offers one concrete meeting time and a reason to reply now.'
    : 'Advance the conversation with a specific ask tied to their current buying context.';

  return {
    title: tone === 'watch' ? 'Lead engagement is cooling' : 'Conversation still has momentum',
    tone,
    summary,
    inferredSentiment: tone === 'watch' ? 'Cooling' : 'Warm',
    nextStep,
    evidence: [
      `Rating: ${contact.rating}`,
      `Status: ${contact.status}`,
      `${contact.totalEmails} recorded email${contact.totalEmails === 1 ? '' : 's'}`,
    ],
    actionLabel: tone === 'watch' ? 'Draft Follow-Up' : 'Advance In Agent',
    prompt: `Draft the next outreach for ${fullName}. Context: status ${contact.status}, lifecycle ${contact.lifecycle}, rating ${contact.rating}, ${contact.totalEmails} recorded emails. Recommended next step: ${nextStep}`,
  };
}

export function buildDealInsight(
  deal: Deal,
  pipeline: Pipeline,
  now: Date = new Date()
): DealInsight {
  const currentStage = pipeline.stages.find((stage) => stage._id === deal.stageId);
  const currentStageAgeDays = getCurrentStageAgeDays(deal, now);
  const expectedCloseSlipDays = daysSince(deal.expectedCloseDate, now);
  const nextActivityDelayDays = daysSince(deal.nextActivityAt, now);
  const staleStage = Boolean(
    currentStage?.rottenDays &&
    currentStageAgeDays !== null &&
    currentStageAgeDays > currentStage.rottenDays
  );
  const overdueClose = expectedCloseSlipDays !== null && expectedCloseSlipDays > 0;
  const overdueNextActivity = nextActivityDelayDays !== null && nextActivityDelayDays > 0;

  const riskSignals = [staleStage, overdueClose, overdueNextActivity].filter(Boolean).length;
  const severity: InsightSeverity = riskSignals >= 2 ? 'high' : riskSignals === 1 ? 'medium' : 'low';

  const blockerParts = [
    staleStage && currentStage ? `${currentStage.name} has been idle longer than its ${currentStage.rottenDays}-day threshold` : null,
    overdueClose ? `expected close date slipped by ${expectedCloseSlipDays} day${expectedCloseSlipDays === 1 ? '' : 's'}` : null,
    overdueNextActivity ? `next activity is overdue by ${nextActivityDelayDays} day${nextActivityDelayDays === 1 ? '' : 's'}` : null,
  ].filter(Boolean);

  const blocker = blockerParts.length > 0
    ? blockerParts.join(', ')
    : 'No major delivery blockers were inferred from the current deal timeline.';

  const summary = overdueClose
    ? `The expected close date slipped, so ${deal.name} now needs a recovery plan before confidence drops further.`
    : staleStage && currentStage
      ? `${deal.name} is sitting in ${currentStage.name} longer than expected and needs a decisive push.`
      : `${deal.name} is still progressing, but it needs a crisp next action to avoid stalling.`;

  const nextStep = severity === 'high'
    ? 'Confirm the buyer blocker, reset the close plan, and create an owner task for the next live conversation.'
    : 'Book the next decision-making touchpoint and tighten the path to the next stage.';

  return {
    title: severity === 'high' ? 'Deal risk is high' : severity === 'medium' ? 'Deal needs attention' : 'Deal is progressing',
    severity,
    summary,
    blocker,
    reasoning: `Current stage: ${currentStage?.name || 'Unknown'}, value ${deal.currency} ${deal.value.toLocaleString()}, probability ${deal.probability}%.`,
    nextStep,
    evidence: [
      `Priority: ${deal.priority}`,
      `Stage: ${currentStage?.name || 'Unknown'}`,
      `${deal.totalActivities} recorded activit${deal.totalActivities === 1 ? 'y' : 'ies'}`,
    ],
    actionLabel: severity === 'high' ? 'Rescue In Agent' : 'Advance In Agent',
    prompt: `Review the CRM deal "${deal.name}" in stage ${currentStage?.name || 'Unknown'} and produce a rescue plan. Blockers: ${blocker}. Recommended next step: ${nextStep}`,
  };
}
