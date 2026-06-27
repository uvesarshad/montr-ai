import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity,
  BarChart3,
  ChevronRight,
  Mail,
  MessageSquare,
  Send,
  Settings,
  Users,
  Workflow,
} from 'lucide-react';
import type { MarketingWorkspaceData } from '@/lib/marketing/workspace.server';
import { cn } from '@/lib/utils';
import { ModuleShell } from '@/components/shell/module-shell';
import { Banner, Card, Chip, EmptyState, KpiRow, type ChipTone } from '@/components/ui-kit';
import styles from './marketing-overview.module.css';

interface MarketingOverviewProps {
  data: MarketingWorkspaceData;
}

/* ── Main /marketing overview ─────────────────────────────────────────── */

export function MarketingOverviewDashboard({ data }: MarketingOverviewProps) {
  const latestEmailOpen = data.recentEmailCampaigns[0]?.openRate ?? 0;
  const latestWaDelivery = data.recentWhatsAppCampaigns[0]?.deliveryRate ?? 0;

  const metricCards = [
    { label: 'Active Automations', value: `${data.activeAutomations}/${data.totalAutomations}`, icon: Workflow, accent: true },
    { label: 'WA Conversations', value: String(data.openWhatsAppConversations), icon: MessageSquare },
    { label: 'Email Providers', value: String(data.connectedProviders), icon: Mail },
    { label: 'WA Accounts', value: String(data.connectedWhatsAppAccounts), icon: Users },
  ];

  return (
    <div className={styles.page}>
      {/* Channel status bar */}
      <section className={styles.channelBar}>
        <div className={styles.channelHeader}>
          <span className={styles.livePill}>
            <span className={styles.liveDot} />
            <span className={styles.liveText}>Live</span>
          </span>
          <span className={styles.channelName}>Marketing Workspace</span>
          <span className={styles.channelSub}>
            — {data.brands.length} brand{data.brands.length !== 1 ? 's' : ''} connected
          </span>
          <Link href="/inbox?channel=whatsapp" className={styles.link}>
            Open Inbox
            <ChevronRight className={styles.linkIcon} />
          </Link>
        </div>
        <div className={styles.channelStats}>
          <div className={styles.channelStatCell}>
            <div className={styles.channelStatValue}>
              {data.openWhatsAppConversations}
            </div>
            <div className={styles.channelStatLabel}>open WhatsApp conversations</div>
          </div>
          <div className={styles.channelStatCell}>
            <div className={cn(styles.channelStatValue, styles.channelStatValueAccent)}>
              {latestEmailOpen.toFixed(1)}%
            </div>
            <div className={styles.channelStatLabel}>latest email open rate</div>
          </div>
          <div className={styles.channelStatCell}>
            <div className={styles.channelStatValue}>
              {data.activeAutomations}
            </div>
            <div className={styles.channelStatLabel}>active canvas automations</div>
          </div>
        </div>
      </section>

      {/* Metric cards */}
      <section className={styles.metricsRow}>
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className={styles.metricCard}>
              <div className={styles.metricIcon}>
                <Icon className="size-4" />
              </div>
              <div className={styles.metricBody}>
                <div className={cn(styles.metricValue, metric.accent && styles.metricValueAccent)}>
                  {metric.value}
                </div>
                <div className={styles.metricLabel}>{metric.label}</div>
              </div>
            </div>
          );
        })}
      </section>

      {/* Main 3-column grid */}
      <div className={cn(styles.mainGrid, styles.mainGridThree)}>
        {/* Email campaigns */}
        <CampaignModCard
          title="Recent email campaigns"
          eyebrow="Email"
          href="/campaigns?channel=email"
          footerNote={`${data.recentEmailCampaigns.length} recent · ${latestEmailOpen.toFixed(1)}% avg open`}
          emptyText="No email campaigns yet"
          rows={data.recentEmailCampaigns.map((c) => ({
            id: c.id,
            href: '/marketing/email/campaigns',
            title: c.name,
            meta: `${c.sent} sent · ${c.openRate.toFixed(1)}% open`,
            time: formatAgo(c.updatedAt),
            status: c.status,
          }))}
        />

        {/* WhatsApp campaigns */}
        <CampaignModCard
          title="Recent WA campaigns"
          eyebrow="WhatsApp"
          href="/campaigns?channel=whatsapp"
          footerNote={`${data.recentWhatsAppCampaigns.length} recent · ${latestWaDelivery.toFixed(1)}% delivery`}
          emptyText="No WhatsApp campaigns yet"
          rows={data.recentWhatsAppCampaigns.map((c) => ({
            id: c.id,
            href: '/marketing/whatsapp/campaigns',
            title: c.name,
            meta: `${c.sent} sent · ${c.deliveryRate.toFixed(1)}% delivered`,
            time: formatAgo(c.updatedAt),
            status: c.status,
          }))}
        />

        {/* Priorities + Automations stacked */}
        <div className={styles.stackCol}>
          <PrioritiesModCard data={data} />
          <AutomationModCard data={data} />
        </div>
      </div>
    </div>
  );
}

/* ── /marketing/whatsapp overview ─────────────────────────────────────── */

export function MarketingWhatsAppOverview({ data }: MarketingOverviewProps) {
  const latestDelivery = data.recentWhatsAppCampaigns[0]?.deliveryRate ?? 0;
  const latestRead = data.recentWhatsAppCampaigns[0]?.readRate ?? 0;

  const metricCards = [
    { label: 'Connected Accounts', value: String(data.connectedWhatsAppAccounts), icon: Users },
    { label: 'Open Conversations', value: String(data.openWhatsAppConversations), icon: MessageSquare },
    { label: 'Delivery Rate', value: `${latestDelivery.toFixed(1)}%`, icon: Send, accent: true },
    { label: 'Read Rate', value: `${latestRead.toFixed(1)}%`, icon: BarChart3 },
  ];

  return (
    <div className={styles.page}>
      {/* WA status bar */}
      <section className={styles.channelBar}>
        <div className={styles.channelHeader}>
          <span className={styles.livePill}>
            <span className={styles.liveDot} />
            <span className={styles.liveText}>Live</span>
          </span>
          <span className={styles.channelName}>WhatsApp Channel</span>
          <span className={styles.channelSub}>
            {data.connectedWhatsAppAccounts > 0
              ? `— ${data.connectedWhatsAppAccounts} account${data.connectedWhatsAppAccounts !== 1 ? 's' : ''} connected`
              : '— no accounts connected'}
          </span>
          <Link href="/inbox?channel=whatsapp" className={styles.link}>
            Open Inbox
            <ChevronRight className={styles.linkIcon} />
          </Link>
        </div>
        <div className={styles.channelStats}>
          <div className={styles.channelStatCell}>
            <div className={styles.channelStatValue}>
              {data.openWhatsAppConversations}
            </div>
            <div className={styles.channelStatLabel}>open conversations</div>
          </div>
          <div className={styles.channelStatCell}>
            <div className={cn(styles.channelStatValue, styles.channelStatValueAccent)}>
              {latestDelivery.toFixed(1)}%
            </div>
            <div className={styles.channelStatLabel}>delivery rate (latest)</div>
          </div>
          <div className={styles.channelStatCell}>
            <div className={styles.channelStatValue}>
              {latestRead.toFixed(1)}%
            </div>
            <div className={styles.channelStatLabel}>read rate (latest)</div>
          </div>
        </div>
      </section>

      {/* Metrics */}
      <section className={styles.metricsRow}>
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className={styles.metricCard}>
              <div className={styles.metricIcon}>
                <Icon className="size-4" />
              </div>
              <div className={styles.metricBody}>
                <div className={cn(styles.metricValue, metric.accent && styles.metricValueAccent)}>
                  {metric.value}
                </div>
                <div className={styles.metricLabel}>{metric.label}</div>
              </div>
            </div>
          );
        })}
      </section>

      {/* Main grid */}
      <div className={cn(styles.mainGrid, styles.mainGridWide)}>
        <CampaignModCard
          title="Recent WhatsApp sends"
          eyebrow="Campaigns"
          href="/campaigns?channel=whatsapp"
          footerNote={`${data.recentWhatsAppCampaigns.length} recent · ${latestDelivery.toFixed(1)}% avg delivery`}
          emptyText="No WhatsApp campaigns yet"
          rows={data.recentWhatsAppCampaigns.map((c) => ({
            id: c.id,
            href: '/marketing/whatsapp/campaigns',
            title: c.name,
            meta: `${c.sent} sent · ${c.deliveryRate.toFixed(1)}% delivered · ${c.readRate.toFixed(1)}% read`,
            time: formatAgo(c.updatedAt),
            status: c.status,
          }))}
        />

        <div className={styles.stackCol}>
          <ChannelReadinessCard
            cells={[
              { value: String(data.connectedWhatsAppAccounts), label: 'connected accounts' },
              { value: String(data.openWhatsAppConversations), label: 'open conversations' },
              { value: String(data.totalAutomations), label: 'automations' },
              { value: String(data.recentWhatsAppCampaigns.length), label: 'recent campaigns' },
            ]}
          />
          <AutomationModCard data={data} />
        </div>
      </div>
    </div>
  );
}

/* ── /marketing/email overview ────────────────────────────────────────── */

export function MarketingEmailOverview({ data }: MarketingOverviewProps) {
  const latestEmail = data.recentEmailCampaigns[0];
  const openRate = latestEmail?.openRate ?? 0;
  const clickRate = latestEmail?.clickRate ?? 0;

  const providerMeta =
    data.connectedProviders > 0
      ? `${data.connectedProviders} provider${data.connectedProviders !== 1 ? 's' : ''} active`
      : 'no providers connected';

  const readiness: { value: string; label: string }[] = [
    { value: String(data.connectedProviders), label: 'providers connected' },
    { value: String(data.recentEmailCampaigns.length), label: 'recent campaigns' },
    { value: `${openRate.toFixed(1)}%`, label: 'open rate' },
    { value: `${clickRate.toFixed(1)}%`, label: 'click rate' },
  ];

  return (
    <ModuleShell
      title="Overview"
      meta={`Email marketing · ${providerMeta}`}
      contentClassName="flex flex-col gap-3 pb-6"
    >
      {/* Live channel banner */}
      <Banner
        tone="ok"
        title="Email channel · Live"
        action={
          <Link
            href="/campaigns?channel=email"
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-input bg-card px-3 text-[12.5px] font-medium shadow-btn transition-colors hover:bg-muted"
          >
            View campaigns
            <ChevronRight className="size-3.5" />
          </Link>
        }
      >
        {providerMeta} · {openRate.toFixed(1)}% open · {clickRate.toFixed(1)}% click (latest)
      </Banner>

      {/* Metric tiles */}
      <KpiRow
        items={[
          { icon: Settings, label: 'Connected providers', value: String(data.connectedProviders), pastel: 'violet' },
          { icon: Send, label: 'Campaigns tracked', value: String(data.recentEmailCampaigns.length), pastel: 'blue' },
          { icon: BarChart3, label: 'Open rate', value: `${openRate.toFixed(1)}%`, pastel: 'mint' },
          { icon: Mail, label: 'Click rate', value: `${clickRate.toFixed(1)}%`, pastel: 'peach' },
        ]}
      />

      {/* Main grid */}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <Card
          spotlight
          icon={Mail}
          title="Recent email sends"
          meta="campaigns"
          action={
            <Link
              href="/campaigns?channel=email"
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-strong hover:underline"
            >
              View all
              <ChevronRight className="size-3.5" />
            </Link>
          }
          bodyClassName="flex flex-col"
          footer={
            <>
              <span>
                {data.recentEmailCampaigns.length} recent · {openRate.toFixed(1)}% avg open
              </span>
              <Link href="/campaigns?channel=email" className="font-medium text-brand-strong hover:underline">
                All campaigns
              </Link>
            </>
          }
        >
          {data.recentEmailCampaigns.length > 0 ? (
            <div className="flex flex-col">
              {data.recentEmailCampaigns.map((c) => (
                <Link
                  key={c.id}
                  href="/marketing/email/campaigns"
                  className="flex items-center gap-3 border-t border-border px-4 py-2.5 transition-colors first:border-t-0 hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold">{c.name}</div>
                    <div className="truncate text-[12.5px] text-muted-foreground">
                      {c.sent} sent · {c.openRate.toFixed(1)}% open · {c.clickRate.toFixed(1)}% click
                    </div>
                  </div>
                  <Chip tone={statusChipTone(c.status)} dot className="capitalize">
                    {c.status}
                  </Chip>
                  <span className="shrink-0 text-[12px] text-muted-foreground">{formatAgo(c.updatedAt)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={Mail} title="No email campaigns yet" className="py-8" />
          )}
        </Card>

        <div className="flex flex-col gap-3">
          <Card spotlight icon={Activity} title="Channel readiness" bodyClassName="p-3">
            <div className="grid grid-cols-2 gap-2">
              {readiness.map((cell) => (
                <div key={cell.label} className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                  <div className="font-mono text-[20px] font-semibold tabular-nums">{cell.value}</div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground">{cell.label}</div>
                </div>
              ))}
            </div>
          </Card>
          <AutomationModCard data={data} />
        </div>
      </div>
    </ModuleShell>
  );
}

function statusChipTone(status: string): ChipTone {
  const s = status.toLowerCase();
  if (s === 'completed' || s === 'sent') return 'ok';
  if (s === 'failed' || s === 'cancelled') return 'warn';
  if (s === 'active' || s === 'running' || s === 'sending') return 'brand';
  if (s === 'scheduled') return 'info';
  if (s === 'draft') return 'gray';
  return 'gray';
}

/* ── Shared sub-components ───────────────────────────────────────────────── */

type CampaignRow = {
  id: string;
  href: string;
  title: string;
  meta: string;
  time: string;
  status: string;
};

function CampaignModCard({
  title,
  eyebrow,
  href,
  footerNote,
  emptyText,
  rows,
}: {
  title: string;
  eyebrow?: string;
  href: string;
  footerNote: string;
  emptyText: string;
  rows: CampaignRow[];
}) {
  return (
    <section className={styles.modCard}>
      <div className={styles.modHeader}>
        <div className={styles.modIcon}>
          <Mail className={styles.modIconSvg} />
        </div>
        <span className={styles.modTitle}>{title}</span>
        {eyebrow ? <span className={styles.modCount}>· {eyebrow}</span> : null}
        <Link href={href} className={styles.link}>
          View all
          <ChevronRight className={styles.linkIcon} />
        </Link>
      </div>
      <div className={styles.modBody}>
        {rows.length > 0
          ? rows.map((row) => (
              <Link key={row.id} href={row.href} className={styles.listRow}>
                <div className={styles.listContent}>
                  <div className={styles.listName}>{row.title}</div>
                  <div className={styles.listSub}>{row.meta}</div>
                </div>
                <div className={styles.listRight}>
                  <span className={getStatusChip(row.status)}>{row.status}</span>
                  <span className={styles.time}>{row.time}</span>
                </div>
              </Link>
            ))
          : (
            <div className={styles.emptyState}>{emptyText}</div>
          )}
      </div>
      <div className={styles.modFooter}>
        <span className={styles.footerNote}>{footerNote}</span>
        <Link href={href} className={cn(styles.link, styles.linkInline)}>
          All campaigns
        </Link>
      </div>
    </section>
  );
}

function PrioritiesModCard({ data }: { data: MarketingWorkspaceData }) {
  return (
    <section className={styles.modCard}>
      <div className={styles.modHeader}>
        <div className={styles.modIcon}>
          <Activity className={styles.modIconSvg} />
        </div>
        <span className={styles.modTitle}>Priorities</span>
        <span className={styles.modCount}>· what to move next</span>
      </div>
      <div className={styles.modBody}>
        {data.workspace.priorities.length > 0
          ? data.workspace.priorities.map((priority) => (
              <Link key={priority.title} href={priority.href} className={styles.priorityRow}>
                <span
                  className={cn(
                    styles.priorityDot,
                    priority.status === 'focus' ? styles.priorityFocus : styles.prioritySetup
                  )}
                />
                <div className={styles.priorityContent}>
                  <div className={styles.priorityTitle}>{priority.title}</div>
                  <div className={styles.priorityDesc}>{priority.description}</div>
                </div>
                <span className={priority.status === 'focus' ? styles.chipPurple : styles.chip}>
                  {priority.status === 'focus' ? 'Focus' : 'Setup'}
                </span>
              </Link>
            ))
          : (
            <div className={styles.emptyState}>All priorities complete.</div>
          )}
      </div>
    </section>
  );
}

function AutomationModCard({ data }: { data: MarketingWorkspaceData }) {
  return (
    <section className={styles.modCard}>
      <div className={styles.modHeader}>
        <div className={styles.modIcon}>
          <Workflow className={styles.modIconSvg} />
        </div>
        <span className={styles.modTitle}>Automations</span>
        <span className={styles.modCount}>· {data.totalAutomations} total</span>
        <Link href="/canvas" className={styles.link}>
          Open canvas
          <ChevronRight className={styles.linkIcon} />
        </Link>
      </div>
      <div className={styles.modBody}>
        {data.recentAutomations.length > 0
          ? data.recentAutomations.map((automation) => (
              <Link key={automation.id} href={`/canvas/${automation.id}`} className={styles.listRow}>
                <div
                  className={cn(styles.listIcon, automation.isActive ? styles.listIconActive : styles.listIconInactive)}
                >
                  <Workflow className="size-3" />
                </div>
                <div className={styles.listContent}>
                  <div className={styles.listName}>{automation.name}</div>
                  <div className={styles.listSub}>{automation.executionCount} runs</div>
                </div>
                <div className={styles.listRight}>
                  <span className={cn(styles.pip, automation.isActive ? styles.pipGreen : styles.pipGray)} />
                  <span className={styles.time}>{formatAgo(automation.updatedAt)}</span>
                </div>
              </Link>
            ))
          : (
            <div className={styles.emptyState}>No automations yet</div>
          )}
      </div>
      <div className={styles.modFooter}>
        <span className={styles.footerNote}>
          {data.activeAutomations} active · {data.totalAutomations - data.activeAutomations} inactive
        </span>
        <Link href="/canvas" className={cn(styles.link, styles.linkInline)}>
          Open workspace
        </Link>
      </div>
    </section>
  );
}

function ChannelReadinessCard({
  cells,
}: {
  cells: { value: string; label: string }[];
}) {
  return (
    <section className={styles.modCard}>
      <div className={styles.modHeader}>
        <div className={styles.modIcon}>
          <Activity className={styles.modIconSvg} />
        </div>
        <span className={styles.modTitle}>Channel Readiness</span>
      </div>
      <div className={styles.modBody}>
        <div className={styles.infoGrid}>
          {cells.map((cell) => (
            <div key={cell.label} className={styles.infoCell}>
              <div className={styles.infoCellValue}>{cell.value}</div>
              <div className={styles.infoCellLabel}>{cell.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Utilities ───────────────────────────────────────────────────────────── */

function getStatusChip(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === 'completed' || normalized === 'sent') return styles.chipGreen;
  if (normalized === 'failed' || normalized === 'cancelled') return styles.chipAmber;
  if (normalized === 'active' || normalized === 'running') return styles.chipBlue;
  if (normalized === 'draft') return styles.chip;
  return styles.chipPurple;
}

function formatAgo(value: string) {
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}
