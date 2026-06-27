'use client';

/**
 * /ui-kit — the living visual library.
 *
 * Renders every component exported from `@/components/ui-kit` with its
 * variants, straight from the kit (no copies). If it looks wrong here, fix it
 * in the kit — every module inherits. Catalog + props: ui-kit/REGISTRY.md.
 */

import * as React from 'react';
import {
  Activity,
  Bell,
  Bot,
  Calendar,
  Check,
  Copy as CopyIcon,
  DollarSign,
  Eye,
  EyeOff,
  Flame,
  Globe,
  Inbox as InboxIcon,
  Mail,
  MessageCircle,
  MessagesSquare,
  Pencil,
  Plus,
  Rocket,
  Send,
  Settings,
  Sparkles,
  Tags,
  Trash2,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  ActionMenu,
  ActivityItem,
  AreaChart,
  Avatar,
  AvatarStack,
  Banner,
  BentoGrid,
  BentoItem,
  BulkBar,
  Button,
  Card,
  ChatBubble,
  ChatMessage,
  Checkbox,
  Chip,
  BetaBadge,
  CollapsibleSection,
  ConfirmDialog,
  ConversationItem,
  CopyField,
  DataTable,
  DealCard,
  DetailPanel,
  Donut,
  EmptyState,
  Field,
  FilterBar,
  FlowNode,
  FormDialog,
  IconButton,
  Input,
  KpiTile,
  Label,
  MessageComposer,
  Meter,
  PageHeader,
  Pagination,
  PipelineColumn,
  RateBar,
  SearchInput,
  Segmented,
  Select,
  Separator,
  SettingRow,
  Skeleton,
  Spark,
  Spinner,
  StatCard,
  Stepper,
  Switch,
  Table,
  Tabs,
  Textarea,
  TextEffect,
  Timeline,
  Toolbar,
  WaPhonePreview,
  type ChipTone,
  type DataTableColumn,
  type Pastel,
} from '@/components/ui-kit';

/* ------------------------------------------------------------- scaffolding */

const SECTIONS = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'primitives', label: 'Primitives' },
  { id: 'forms', label: 'Forms' },
  { id: 'surfaces', label: 'Surfaces' },
  { id: 'layout', label: 'Layout' },
  { id: 'data', label: 'Data table' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'charts', label: 'Charts' },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="mb-4 border-b border-border pb-2 text-[17px] font-semibold tracking-[-0.02em]">{title}</h2>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

function Demo({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[13px] font-semibold">{title}</span>
        {hint ? <span className="font-mono text-[11px] text-muted-foreground">{hint}</span> : null}
      </div>
      <div className={cn('rounded-lg border border-border bg-[var(--app-bg)] p-4', className)}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------- sample data */

const CHIP_TONES: ChipTone[] = ['gray', 'ok', 'warn', 'info', 'danger', 'brand', 'purple'];
const PASTELS: Pastel[] = ['violet', 'mint', 'blue', 'peach', 'rose', 'lemon'];
const NAMES = ['Ana Silva', 'Omar Khan', 'Lena Fischer', 'Ravi Patel', 'Mia Chen'];

interface DemoRow extends Record<string, unknown> {
  id: string;
  name: string;
  channel: string;
  status: 'active' | 'paused' | 'draft';
  sent: number;
  openRate: number;
}

const DEMO_ROWS: DemoRow[] = [
  { id: '1', name: 'Spring launch', channel: 'Email', status: 'active', sent: 12480, openRate: 62 },
  { id: '2', name: 'Cart recovery', channel: 'WhatsApp', status: 'active', sent: 8311, openRate: 81 },
  { id: '3', name: 'Win-back Q2', channel: 'Email', status: 'paused', sent: 4002, openRate: 47 },
  { id: '4', name: 'VIP preview', channel: 'SMS', status: 'draft', sent: 0, openRate: 0 },
  { id: '5', name: 'NPS follow-up', channel: 'Email', status: 'active', sent: 2210, openRate: 58 },
];

const STATUS_TONE: Record<DemoRow['status'], ChipTone> = { active: 'ok', paused: 'warn', draft: 'gray' };

/* ----------------------------------------------------------------- gallery */

export function UiKitGallery() {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] gap-8 px-6 py-6">
      {/* Anchor nav */}
      <nav className="sticky top-6 hidden h-fit w-[150px] shrink-0 flex-col gap-0.5 lg:flex">
        <span className="mb-2 px-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Sections
        </span>
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-md px-2 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {s.label}
          </a>
        ))}
      </nav>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-10 pb-20">
        <PageHeader
          icon={Sparkles}
          title="UI Kit"
          sub="Every component in src/components/ui-kit — live, from the single source of truth. Toggle the theme in the topbar to preview dark mode."
        />

        <TokensSection />
        <PrimitivesSection />
        <FormsSection />
        <SurfacesSection />
        <LayoutSection />
        <DataSection />
        <OverlaysSection />
        <BlocksSection />
        <ChartsSection />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ tokens */

function Swatch({ name, cls }: { name: string; cls: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn('size-8 shrink-0 rounded-md border border-border', cls)} />
      <span className="font-mono text-[11px] text-muted-foreground">{name}</span>
    </div>
  );
}

function TokensSection() {
  return (
    <Section id="tokens" title="Tokens">
      <Demo title="Semantic colors" hint="globals.css :root / .dark">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Swatch name="primary" cls="bg-primary" />
          <Swatch name="brand" cls="bg-brand" />
          <Swatch name="brand-muted" cls="bg-brand-muted" />
          <Swatch name="success" cls="bg-success" />
          <Swatch name="warning" cls="bg-warning" />
          <Swatch name="danger" cls="bg-danger" />
          <Swatch name="muted" cls="bg-muted" />
          <Swatch name="border" cls="bg-border" />
        </div>
      </Demo>
      <Demo title="Pastels (KPI tiles only)" hint='pastel="violet|mint|blue|peach|rose|lemon"'>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {PASTELS.map((p) => (
            <Swatch key={p} name={p} cls={`bg-pastel-${p}`} />
          ))}
        </div>
      </Demo>
    </Section>
  );
}

/* -------------------------------------------------------------- primitives */

function PrimitivesSection() {
  const [seg, setSeg] = React.useState('Week');
  const [tab, setTab] = React.useState('overview');
  const [chips, setChips] = React.useState<string[]>(['Email']);
  const [secret, setSecret] = React.useState(true);

  return (
    <Section id="primitives" title="Primitives">
      <Demo title="Button" hint="variant · size · icon · sheen · asChild">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={Plus}>Primary</Button>
          <Button variant="brand" icon={Sparkles}>Brand</Button>
          <Button variant="warm" icon={Flame}>Warm</Button>
          <Button variant="danger" icon={Trash2}>Danger</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="brand" sheen icon={Zap}>Sheen</Button>
          <Button variant="primary" size="sm">Small</Button>
          <Button variant="outline" size="sm" iconRight={Send}>Icon right</Button>
          <Button variant="primary" disabled>Disabled</Button>
        </div>
      </Demo>

      <Demo title="IconButton" hint="icon · dot">
        <div className="flex items-center gap-1">
          <IconButton icon={Bell} aria-label="Notifications" />
          <IconButton icon={Bell} dot aria-label="Notifications (unread)" />
          <IconButton icon={Settings} aria-label="Settings" />
          <IconButton icon={Trash2} aria-label="Delete" className="hover:text-danger" />
        </div>
      </Demo>

      <Demo title="Chip" hint="tone · dot · icon · count · onClick/selected">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {CHIP_TONES.map((t) => (
              <Chip key={t} tone={t}>{t}</Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="ok" dot>Live</Chip>
            <Chip tone="info" icon={Mail}>Email</Chip>
            <Chip tone="brand" count={12}>Approved</Chip>
            <Chip tone="gray" onRemove={() => {}}>Removable</Chip>
            {['Email', 'WhatsApp', 'SMS'].map((c) => (
              <Chip
                key={c}
                tone={chips.includes(c) ? 'brand' : 'gray'}
                selected={chips.includes(c)}
                onClick={() => setChips((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))}
              >
                {c}
              </Chip>
            ))}
            <span className="self-center text-[11.5px] text-muted-foreground">← toggle chips</span>
          </div>
        </div>
      </Demo>

      <Demo title="BetaBadge" hint="tone (default · onDark) · size (sm · md) — flags non-launch-critical surfaces">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
            AI Studio <BetaBadge size="md" />
          </span>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
            Ads <BetaBadge size="sm" />
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-[#0a0a0a] px-2.5 py-1.5 text-[13px] font-medium text-white/70">
            AI Bots <BetaBadge tone="onDark" size="sm" />
          </span>
        </div>
      </Demo>

      <Demo title="Avatar / AvatarStack" hint="name · size · square · src">
        <div className="flex items-center gap-4">
          <Avatar name="Ana Silva" size={36} />
          <Avatar name="Omar Khan" size={28} />
          <Avatar name="Acme Corp" size={28} square />
          <AvatarStack names={NAMES} />
        </div>
      </Demo>

      <Demo title="Input / SearchInput" hint="icon · trailingIcon · onTrailingClick">
        <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
          <Input placeholder="Plain input" />
          <SearchInput />
          <Input icon={Mail} placeholder="With leading icon" />
          <Input
            type={secret ? 'password' : 'text'}
            defaultValue="hunter2hunter2"
            trailingIcon={secret ? Eye : EyeOff}
            onTrailingClick={() => setSecret((s) => !s)}
            trailingAriaLabel="Toggle visibility"
          />
        </div>
      </Demo>

      <Demo title="Segmented / Tabs" hint="options · value · onChange">
        <div className="flex flex-col gap-4">
          <Segmented options={['Day', 'Week', 'Month']} value={seg} onChange={setSeg} />
          <Tabs
            tabs={[
              { value: 'overview', label: 'Overview' },
              { value: 'activity', label: 'Activity' },
              { value: 'settings', label: 'Settings' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </Demo>

      <Demo title="Meter / RateBar / Spinner" hint="value · tone">
        <div className="flex max-w-md flex-col gap-3">
          <Meter value={72} />
          <Meter value={45} tone="ok" />
          <Meter value={88} tone="warn" />
          <div className="flex items-center gap-4">
            <RateBar value={62} />
            <RateBar value={81} tone="ok" />
            <RateBar value={23} tone="danger" />
            <Spinner />
            <Spinner size={20} />
          </div>
        </div>
      </Demo>
    </Section>
  );
}

/* ------------------------------------------------------------------- forms */

function FormsSection() {
  const [model, setModel] = React.useState('claude-opus');
  const [plain, setPlain] = React.useState('email');
  const [notif, setNotif] = React.useState(true);

  return (
    <Section id="forms" title="Forms">
      <Demo title="Field" hint="label · hint · error · required">
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <Field label="Workspace name" hint="Shown to your team." required>
            <Input placeholder="Acme Inc." />
          </Field>
          <Field label="Webhook URL" error="Must be a valid https:// URL.">
            <Input defaultValue="ftp://nope" />
          </Field>
        </div>
      </Demo>

      <Demo title="Textarea" hint="kit-styled twin of Input">
        <div className="max-w-2xl">
          <Field label="Brand voice">
            <Textarea placeholder="Friendly, concise, never salesy…" />
          </Field>
        </div>
      </Demo>

      <Demo title="Checkbox · Switch · Label · Separator" hint="brand-tinted controls + divider">
        <div className="flex max-w-2xl flex-col gap-3">
          <label className="flex items-center gap-2">
            <Checkbox defaultChecked />
            <Label>Email me about activity</Label>
          </label>
          <label className="flex items-center gap-2">
            <Checkbox />
            <Label>Weekly digest</Label>
          </label>
          <Separator />
          <div className="flex items-center gap-3">
            <Switch defaultChecked />
            <Label>Auto-publish approved posts</Label>
          </div>
        </div>
      </Demo>

      <Demo title="Select — flat + grouped" hint="options: SelectOption[] | SelectOptionGroup[]">
        <div className="flex flex-wrap gap-3">
          <Select
            value={plain}
            onChange={setPlain}
            options={[
              { value: 'email', label: 'Email', icon: Mail },
              { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
              { value: 'sms', label: 'SMS', icon: MessagesSquare },
            ]}
            triggerClassName="w-[180px]"
          />
          <Select
            value={model}
            onChange={setModel}
            options={[
              {
                label: 'Anthropic',
                options: [
                  { value: 'claude-opus', label: 'Claude Opus' },
                  { value: 'claude-sonnet', label: 'Claude Sonnet' },
                ],
              },
              {
                label: 'Open weights',
                options: [
                  { value: 'llama', label: 'Llama 3.3' },
                  { value: 'mistral', label: 'Mistral Large' },
                ],
              },
            ]}
            triggerClassName="w-[200px]"
          />
        </div>
      </Demo>

      <Demo title="SettingRow" hint="label + description left · control right">
        <div className="max-w-2xl divide-y divide-border">
          <SettingRow icon={Bell} label="Email digests" description="A daily summary of unread notifications.">
            <Switch checked={notif} onCheckedChange={setNotif} />
          </SettingRow>
          <SettingRow icon={Globe} label="Public profile" description="Anyone with the link can view this brand page.">
            <Switch />
          </SettingRow>
        </div>
      </Demo>

      <Demo title="CopyField" hint="value · secret">
        <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
          <CopyField value="https://montr.ai/s/x7K2p" />
          <CopyField value="sk-live-9f8e7d6c5b4a" secret />
        </div>
      </Demo>
    </Section>
  );
}

/* ---------------------------------------------------------------- surfaces */

function SurfacesSection() {
  const [banner, setBanner] = React.useState(true);

  return (
    <Section id="surfaces" title="Surfaces">
      <Demo title="Card" hint="icon · title · meta · action · footer · lift · spotlight">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card
            icon={TrendingUp}
            title="Pipeline"
            meta="last 30 days"
            action={<Button size="sm" variant="brand" icon={Plus}>New</Button>}
            footer={<span>Updated 4 min ago</span>}
          >
            <div className="px-4 pb-4 text-[13px] text-muted-foreground">Card body — anything goes here.</div>
          </Card>
          <Card lift icon={Rocket} title="Hover me" meta="lift">
            <div className="px-4 pb-4 text-[13px] text-muted-foreground">Elevates on hover.</div>
          </Card>
          <Card lift spotlight icon={Sparkles} title="Move your cursor" meta="spotlight">
            <div className="px-4 pb-4 text-[13px] text-muted-foreground">Brand glow follows the cursor.</div>
          </Card>
        </div>
      </Demo>

      <Demo title="TextEffect" hint="animated hero heading — per: word·char·line, preset: blur·fade·scale·slide">
        <TextEffect per="word" preset="fade-in-blur" as="h3" className="text-2xl font-semibold tracking-tight">
          Contrast from elevation, not color.
        </TextEffect>
      </Demo>

      <Demo title="BentoGrid · BentoItem" hint="overview/feature layouts + rich empty states · span via className">
        <BentoGrid className="md:auto-rows-[11rem]">
          <BentoItem
            className="md:col-span-2"
            icon={<InboxIcon className="size-4 text-brand" />}
            title="Unified Inbox"
            description="Every channel, one stream."
            header={<div className="h-full w-full rounded-xl bg-gradient-to-br from-pastel-violet to-pastel-blue" />}
          />
          <BentoItem
            icon={<Bot className="size-4 text-brand" />}
            title="AI Agent"
            description="An autonomous co-pilot."
            header={<div className="h-full w-full rounded-xl bg-gradient-to-br from-pastel-mint to-pastel-lemon" />}
          />
        </BentoGrid>
      </Demo>

      <Demo title="KpiTile" hint="pastel · delta · sub · iconTone">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiTile icon={Users} label="Contacts" value="12,480" delta="+8.2%" sub="vs last month" pastel="violet" />
          <KpiTile icon={Mail} label="Open rate" value="62%" delta="-2.1%" up={false} pastel="mint" />
          <KpiTile icon={Activity} label="Active flows" value="23" iconTone="info" sub="4 paused" />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {PASTELS.map((p) => (
            <KpiTile key={p} label={p} value="1.2k" pastel={p} />
          ))}
        </div>
      </Demo>

      <Demo title="StatCard" hint="compact label/value/delta · optional icon">
        <div className="flex max-w-lg divide-x divide-border">
          <StatCard className="px-4 first:pl-0" icon={DollarSign} label="Revenue" value="$48.2k" delta="+12%" />
          <StatCard className="px-4" icon={Activity} label="Orders" value="1,284" delta="+4%" />
          <StatCard className="px-4" icon={TrendingUp} label="Churn" value="2.1%" delta="-0.4%" up={false} />
        </div>
      </Demo>

      <Demo title="Table (simple, read-only)" hint="surfaces — DataTable below for behaviour">
        <Table<DemoRow>
          rowKey="id"
          columns={[
            { key: 'name', label: 'Campaign' },
            { key: 'channel', label: 'Channel' },
            {
              key: 'status',
              label: 'Status',
              render: (v) => <Chip tone={STATUS_TONE[v as DemoRow['status']]}>{String(v)}</Chip>,
            },
            { key: 'sent', label: 'Sent', align: 'right', mono: true },
          ]}
          rows={DEMO_ROWS.slice(0, 3)}
        />
      </Demo>

      <Demo title="EmptyState / Skeleton">
        <div className="grid gap-4 lg:grid-cols-2">
          <EmptyState
            icon={InboxIcon}
            title="No conversations yet"
            note="Connect a channel to start receiving messages."
            cta={<Button variant="brand" icon={Plus}>Connect channel</Button>}
          />
          <div className="flex flex-col gap-2.5 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <div className="flex gap-2">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-8 flex-1" />
            </div>
          </div>
        </div>
      </Demo>

      <Demo title="Banner" hint="tone · action · onDismiss">
        <div className="flex flex-col gap-2.5">
          {banner ? (
            <Banner tone="info" icon={Sparkles} title="New: AI workflows" onDismiss={() => setBanner(false)}>
              Generate complete automations from a prompt.
            </Banner>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setBanner(true)}>Restore dismissed banner</Button>
          )}
          <Banner tone="ok" icon={Check} title="Domain verified" />
          <Banner tone="warn" icon={Zap} title="Credits running low" action={<Button size="sm" variant="primary">Top up</Button>}>
            4,200 of 5,000 used this cycle.
          </Banner>
          <Banner tone="danger" icon={X} title="Provider disconnected">
            Re-authenticate to resume sending.
          </Banner>
        </div>
      </Demo>

      <Demo title="CollapsibleSection" hint="title · icon · action · defaultOpen">
        <div className="flex max-w-md flex-col gap-2.5">
          <CollapsibleSection icon={Tags} title="Goals" action={<Chip tone="brand" count={3}>active</Chip>}>
            <div className="flex flex-col gap-2 text-[13px]">
              <Meter value={64} tone="ok" />
              <span className="text-muted-foreground">Q2 pipeline — 64% to target</span>
            </div>
          </CollapsibleSection>
          <CollapsibleSection icon={Settings} title="Advanced" defaultOpen={false}>
            <p className="text-[13px] text-muted-foreground">Collapsed by default.</p>
          </CollapsibleSection>
        </div>
      </Demo>
    </Section>
  );
}

/* ------------------------------------------------------------------ layout */

function LayoutSection() {
  const [filters, setFilters] = React.useState<string[]>(['Active']);
  const [page, setPage] = React.useState(2);
  const [pageSize, setPageSize] = React.useState(25);

  return (
    <Section id="layout" title="Layout">
      <Demo title="PageHeader" hint="title · sub · icon · actions">
        <PageHeader
          icon={Users}
          title="Contacts"
          sub="1,284 people across 3 segments"
          actions={
            <>
              <Button variant="outline" icon={Sparkles}>Ask AI</Button>
              <Button variant="brand" icon={Plus}>New contact</Button>
            </>
          }
        />
      </Demo>

      <Demo title="Toolbar + FilterBar" hint="left/right clusters · activeCount · onClearAll">
        <Toolbar
          right={
            <>
              <Segmented options={['Grid', 'List']} value="Grid" />
              <Button variant="outline" size="sm" icon={Settings}>View</Button>
            </>
          }
        >
          <SearchInput wrapClassName="w-[220px]" />
          <FilterBar activeCount={filters.length} onClearAll={() => setFilters([])}>
            {['Active', 'Paused', 'Draft'].map((f) => (
              <Chip
                key={f}
                tone={filters.includes(f) ? 'brand' : 'gray'}
                selected={filters.includes(f)}
                onClick={() => setFilters((p) => (p.includes(f) ? p.filter((x) => x !== f) : [...p, f]))}
              >
                {f}
              </Chip>
            ))}
          </FilterBar>
        </Toolbar>
      </Demo>

      <Demo title="BulkBar" hint="count · onClear · actions — see DataTable for the live pairing">
        <BulkBar count={3} onClear={() => undefined}>
          <Button size="sm" variant="outline" icon={Tags}>Tag</Button>
          <Button size="sm" variant="outline" icon={Mail}>Email</Button>
          <Button size="sm" variant="outline" icon={Trash2} className="text-danger">Delete</Button>
        </BulkBar>
      </Demo>

      <Demo title="Pagination" hint="page · pageSize · total · onPageSizeChange">
        <Pagination
          page={page}
          pageSize={pageSize}
          total={1284}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </Demo>
    </Section>
  );
}

/* -------------------------------------------------------------------- data */

function DataSection() {
  const [selected, setSelected] = React.useState<DemoRow[]>([]);
  const [selectionState, setSelectionState] = React.useState<Record<string, boolean>>({});

  const columns: DataTableColumn<DemoRow>[] = [
    { accessorKey: 'name', header: 'Campaign' },
    { accessorKey: 'channel', header: 'Channel' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const v = getValue() as DemoRow['status'];
        return <Chip tone={STATUS_TONE[v]}>{v}</Chip>;
      },
    },
    {
      accessorKey: 'sent',
      header: 'Sent',
      cell: ({ getValue }) => (
        <span className="font-mono tabular-nums">{(getValue() as number).toLocaleString()}</span>
      ),
    },
    {
      accessorKey: 'openRate',
      header: 'Open rate',
      cell: ({ getValue }) => <RateBar value={getValue() as number} tone="ok" />,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: () => (
        <ActionMenu
          items={[
            { label: 'Edit', icon: Pencil },
            { label: 'Duplicate', icon: CopyIcon },
            { label: 'Delete', icon: Trash2, danger: true, separatorBefore: true },
          ]}
        />
      ),
    },
  ];

  return (
    <Section id="data" title="Data table">
      <Demo
        title="DataTable + BulkBar"
        hint="sorting · selection (controlled) · RateBar cells · ActionMenu — select rows to see the BulkBar"
        className="flex flex-col gap-3"
      >
        <BulkBar count={selected.length} onClear={() => setSelectionState({})}>
          <Button size="sm" variant="outline" icon={Tags}>Tag</Button>
          <Button size="sm" variant="outline" icon={Trash2} className="text-danger">Delete</Button>
        </BulkBar>
        <DataTable<DemoRow>
          columns={columns}
          data={DEMO_ROWS}
          enableRowSelection
          rowSelection={selectionState}
          onRowSelectionStateChange={setSelectionState}
          onRowSelectionChange={setSelected}
          getRowId={(r) => r.id}
          onRowClick={() => undefined}
        />
      </Demo>
      <Demo title="DataTable — loading & empty">
        <div className="grid gap-4 lg:grid-cols-2">
          <DataTable<DemoRow> columns={columns.slice(0, 3)} data={[]} loading skeletonRows={3} />
          <DataTable<DemoRow> columns={columns.slice(0, 3)} data={[]} emptyTitle="No campaigns" emptyNote="Create your first campaign to get started." />
        </div>
      </Demo>
    </Section>
  );
}

/* ---------------------------------------------------------------- overlays */

function OverlaysSection() {
  const [formOpen, setFormOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [panelOpen, setPanelOpen] = React.useState(true);

  return (
    <Section id="overlays" title="Overlays">
      <Demo title="FormDialog / ConfirmDialog / ActionMenu" hint="async busy state built in">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="brand" icon={Plus} onClick={() => setFormOpen(true)}>Open FormDialog</Button>
          <Button variant="outline" icon={Trash2} onClick={() => setConfirmOpen(true)}>Open ConfirmDialog</Button>
          <ActionMenu
            trigger={<Button variant="outline">ActionMenu trigger</Button>}
            items={[
              { label: 'Rename', icon: Pencil },
              { label: 'Duplicate', icon: CopyIcon },
              { label: 'Delete', icon: Trash2, danger: true, separatorBefore: true },
            ]}
          />
        </div>

        <FormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          icon={Users}
          title="New contact"
          description="Add someone to your CRM."
          submitLabel="Create"
          onSubmit={() => new Promise((r) => setTimeout(r, 900))}
        >
          <Field label="Full name" required>
            <Input placeholder="Ana Silva" />
          </Field>
          <Field label="Email">
            <Input icon={Mail} placeholder="ana@acme.com" />
          </Field>
          <Field label="Channel">
            <Select
              options={[
                { value: 'email', label: 'Email' },
                { value: 'whatsapp', label: 'WhatsApp' },
              ]}
              placeholder="Pick one…"
            />
          </Field>
        </FormDialog>

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Delete 3 campaigns?"
          description="This permanently removes them and their analytics."
          onConfirm={() => new Promise((r) => setTimeout(r, 700))}
        >
          <Banner tone="warn" icon={Zap} title="2 of these are currently active." />
        </ConfirmDialog>
      </Demo>

      <Demo title="DetailPanel" hint="inline right aside for list→detail screens">
        <div className="flex h-[300px] overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2 p-4">
            <span className="text-[13px] text-muted-foreground">List/content area</span>
            <Button size="sm" variant="outline" onClick={() => setPanelOpen((o) => !o)}>
              {panelOpen ? 'Close' : 'Open'} panel
            </Button>
          </div>
          <DetailPanel
            open={panelOpen}
            onClose={() => setPanelOpen(false)}
            icon={Users}
            title="Ana Silva"
            meta="Contact"
            width={280}
            footer={<Button size="sm" variant="primary">Save</Button>}
          >
            <div className="flex flex-col gap-3">
              <Field label="Status">
                <Select options={[{ value: 'lead', label: 'Lead' }, { value: 'customer', label: 'Customer' }]} value="lead" />
              </Field>
              <Chip tone="ok" dot>Subscribed</Chip>
            </div>
          </DetailPanel>
        </div>
      </Demo>
    </Section>
  );
}

/* ------------------------------------------------------------------ blocks */

function BlocksSection() {
  const [mode, setMode] = React.useState('reply');
  const [step, setStep] = React.useState(1);

  return (
    <Section id="blocks" title="Blocks">
      <Demo title="DealCard + PipelineColumn" hint="kanban building blocks">
        <div className="flex gap-4 overflow-x-auto">
          <PipelineColumn stage={{ name: 'Qualified', tone: 'hsl(var(--info))' }} count={2} total="$86k">
            <DealCard deal={{ name: 'Acme renewal', company: 'Acme Corp', value: 48000, close: 'Jun 21', owner: 'Ana Silva', prob: 70 }} />
            <DealCard deal={{ name: 'Globex pilot', company: 'Globex', value: 38000, close: 'Jul 02', owner: 'Omar Khan', prob: 45 }} />
          </PipelineColumn>
          <PipelineColumn stage={{ name: 'Won', tone: 'hsl(var(--success))' }} count={1} total="$52k">
            <DealCard deal={{ name: 'Initech expansion', company: 'Initech', value: 52000, owner: 'Mia Chen', prob: 100 }} tone="hsl(var(--success))" />
          </PipelineColumn>
        </div>
      </Demo>

      <Demo title="ActivityItem" hint="feed rows">
        <div className="max-w-xl">
          <ActivityItem a={{ who: 'Ana Silva', action: 'moved', target: 'Acme renewal', meta: 'to Won', time: '2m', icon: TrendingUp, tone: 'ok' }} />
          <ActivityItem a={{ who: 'Montr AI', action: 'drafted', target: '3 follow-ups', time: '18m', icon: Bot, tone: 'brand' }} />
          <ActivityItem a={{ who: 'Omar Khan', action: 'scheduled', target: 'VIP preview', meta: 'for Friday', time: '1h', icon: Calendar, tone: 'info' }} />
        </div>
      </Demo>

      <Demo title="ChatBubble / ChatMessage" hint="default + whatsapp · buttons · avatar rows">
        <div className="flex max-w-xl flex-col gap-3">
          <ChatMessage name="Ana Silva" avatarName="Ana Silva" badge={<Chip tone="info" className="h-[18px] text-[10.5px]">Customer</Chip>} time="10:02">
            Hey! Is the spring discount still running?
          </ChatMessage>
          <ChatMessage dir="out" name="Montr AI" avatarName="Montr AI" badge={<Chip tone="brand" className="h-[18px] text-[10.5px]">Agent</Chip>} time="10:03">
            It is — 20% through Friday. Want the link?
          </ChatMessage>
          <ChatBubble variant="whatsapp" dir="out" time="10:04" buttons={['Open shop', 'Talk to a human']}>
            🌸 Spring sale: 20% off everything.
          </ChatBubble>
        </div>
      </Demo>

      <Demo title="MessageComposer" hint="modes · Enter sends · async busy">
        <div className="max-w-xl">
          <MessageComposer
            placeholder="Type a reply…"
            modes={[
              { value: 'reply', label: 'Reply' },
              { value: 'note', label: 'Internal note' },
            ]}
            mode={mode}
            onModeChange={setMode}
            actions={<IconButton icon={Sparkles} aria-label="AI suggest" className="size-7" />}
            onSubmit={() => new Promise((r) => setTimeout(r, 600))}
          />
        </div>
      </Demo>

      <Demo title="ConversationItem" hint="inbox list rows">
        <div className="max-w-sm overflow-hidden rounded-lg border border-border bg-card">
          <ConversationItem
            c={{ name: 'Ana Silva', company: 'Acme Corp', preview: 'Is the spring discount still running?', time: '2m', unread: 2, channel: { icon: MessageCircle, color: '#fff', tint: '#25d366' } }}
            active
          />
          <ConversationItem
            c={{ name: 'Omar Khan', company: 'Globex', preview: 'Thanks, that solved it!', time: '1h', channel: { icon: Mail, color: '#fff', tint: 'hsl(var(--info))' } }}
          />
        </div>
      </Demo>

      <Demo title="Timeline" hint="exec-style event rail">
        <div className="max-w-sm">
          <Timeline
            items={[
              { title: 'Mission started', meta: '09:41:02', icon: Rocket, tone: 'brand' },
              { title: 'Drafted 3 emails', meta: '09:41:38 · 36s', icon: Mail, tone: 'info' },
              { title: 'Awaiting approval', meta: '09:42:00', icon: Bell, tone: 'warn' },
            ]}
          />
        </div>
      </Demo>

      <Demo title="Stepper" hint="wizard step indicator">
        <div className="flex max-w-xl flex-col gap-4">
          <Stepper steps={['Audience', 'Message', 'Schedule', 'Review']} current={step} />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</Button>
            <Button size="sm" variant="primary" onClick={() => setStep((s) => Math.min(3, s + 1))}>Next</Button>
          </div>
        </div>
      </Demo>

      <Demo title="FlowNode" hint="automation canvas node (static)">
        <div className="flex flex-wrap gap-6 py-2">
          <FlowNode node={{ kind: 'Trigger', title: 'New form submission', icon: Zap, tone: 'hsl(var(--brand-strong))', tint: 'hsl(var(--brand-muted))', chip: 'Contact form' }} />
          <FlowNode selected node={{ kind: 'Action', title: 'Send WhatsApp message', icon: MessageCircle, tone: 'hsl(var(--success))', tint: 'hsl(var(--success-muted))' }} />
        </div>
      </Demo>

      <Demo title="WaPhonePreview" hint="WhatsApp template preview">
        <WaPhonePreview
          account="Acme Corp"
          head="Spring sale 🌸"
          body="Hi {{name}} — everything is 20% off through Friday. Tap below to browse."
          buttons={['Open shop', 'Unsubscribe']}
          media
        />
      </Demo>
    </Section>
  );
}

/* ------------------------------------------------------------------ charts */

function ChartsSection() {
  return (
    <Section id="charts" title="Charts">
      <Demo title="Spark / AreaChart / Donut" hint="dependency-free SVG — recharts stays for heavy needs">
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <Card title="Spark" bodyClassName="p-4">
            <Spark data={[4, 8, 6, 12, 9, 16, 14, 22]} />
          </Card>
          <Card title="AreaChart" bodyClassName="p-4">
            <AreaChart
              labels={[
                { x: 0, t: 'Mon' },
                { x: 1, t: 'Tue' },
                { x: 2, t: 'Wed' },
                { x: 3, t: 'Thu' },
                { x: 4, t: 'Fri' },
              ]}
              series={[
                { name: 'Sent', color: 'hsl(var(--brand))', data: [120, 180, 140, 220, 260] },
                { name: 'Opened', color: 'hsl(var(--info))', data: [80, 120, 90, 150, 170] },
              ]}
            />
          </Card>
          <Card title="Donut" bodyClassName="grid place-items-center p-4">
            <Donut
              segments={[
                { value: 48, color: 'hsl(var(--brand))', label: 'Email' },
                { value: 32, color: 'hsl(var(--success))', label: 'WhatsApp' },
                { value: 20, color: 'hsl(var(--info))', label: 'SMS' },
              ]}
            />
          </Card>
        </div>
      </Demo>
    </Section>
  );
}
