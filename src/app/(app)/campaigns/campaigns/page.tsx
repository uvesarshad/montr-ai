'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Plus,
  Play,
  Pause,
  Trash2,
  Edit,
  Send,
  Clock3,
  CheckCircle2,
} from 'lucide-react';

import {
  Button,
  Card,
  Chip,
  SearchInput,
  KpiRow,
  RateBar,
  DataTable,
  ActionMenu,
  ConfirmDialog,
  type ChipTone,
  type DataTableColumn,
} from '@/components/ui-kit';
import { ModuleShell } from '@/components/shell/module-shell';

type EmailCampaign = {
  _id: string;
  name: string;
  type: string;
  status: string;
  targetType?: string;
  targetTags?: string[];
  createdAt: string;
  stats?: {
    sent?: number;
    opened?: number;
    clicked?: number;
  };
};

type CampaignResponse = {
  data?: EmailCampaign[];
};

const STATUS_TONE: Record<string, ChipTone> = {
  completed: 'ok',
  sent: 'ok',
  sending: 'brand',
  scheduled: 'info',
  paused: 'warn',
  failed: 'danger',
  cancelled: 'danger',
  draft: 'gray',
};

function statusTone(status: string): ChipTone {
  return STATUS_TONE[status.toLowerCase()] ?? 'gray';
}

export default function CampaignsPage() {
  const [search, setSearch] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const router = useRouter();

  const { data, isLoading, refetch, error } = useQuery<CampaignResponse>({
    queryKey: ['marketing-campaigns', search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      const response = await fetch(`/api/v2/marketing-email/campaigns?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch campaigns');
      return response.json();
    },
  });

  const campaigns = useMemo(() => data?.data || [], [data]);

  const summary = useMemo(() => {
    const sending = campaigns.filter((campaign) => campaign.status === 'sending').length;
    const scheduled = campaigns.filter((campaign) => campaign.status === 'scheduled').length;
    const completed = campaigns.filter((campaign) => campaign.status === 'completed').length;
    const sent = campaigns.reduce((total, campaign) => total + (campaign.stats?.sent || 0), 0);

    return {
      total: campaigns.length,
      sending,
      scheduled,
      completed,
      sent,
    };
  }, [campaigns]);

  const handleAction = async (id: string, action: 'send' | 'pause' | 'resume' | 'delete') => {
    try {
      let response: Response;
      if (action === 'delete') {
        response = await fetch(`/api/v2/marketing-email/campaigns/${id}`, { method: 'DELETE' });
      } else {
        response = await fetch(`/api/v2/marketing-email/campaigns/${id}/${action}`, { method: 'POST' });
      }

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Action failed');
      }

      toast.success(`Campaign ${action} successful`);
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed');
    }
  };

  const columns = useMemo<DataTableColumn<EmailCampaign>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Campaign',
        cell: ({ row }) => (
          <Link
            href={`/marketing/email/campaigns/${row.original._id}`}
            className="font-semibold text-[13.5px] hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => <span className="capitalize text-muted-foreground">{row.original.type}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Chip tone={statusTone(row.original.status)} dot className="capitalize">
            {row.original.status}
          </Chip>
        ),
      },
      {
        id: 'audience',
        header: 'Audience',
        enableSorting: false,
        cell: ({ row }) => {
          const c = row.original;
          if (c.targetType === 'all') return <Chip tone="gray">All Contacts</Chip>;
          if (c.targetType === 'tags') return <Chip tone="gray">{c.targetTags?.length || 0} Tags</Chip>;
          if (c.targetType === 'segment') return <Chip tone="gray">Segment</Chip>;
          return <span className="text-muted-foreground">—</span>;
        },
      },
      {
        id: 'stats',
        header: 'Sent / Open / Click',
        enableSorting: false,
        cell: ({ row }) => {
          const s = row.original.stats;
          const sent = s?.sent || 0;
          const openRate = sent > 0 ? ((s?.opened || 0) / sent) * 100 : 0;
          const clickRate = sent > 0 ? ((s?.clicked || 0) / sent) * 100 : 0;
          return (
            <span className="flex items-center gap-3">
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{sent}</span>
              <RateBar value={openRate} tone="info" />
              <RateBar value={clickRate} tone="brand" />
            </span>
          );
        },
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        cell: ({ row }) => (
          <span className="text-muted-foreground tabular-nums">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const c = row.original;
          const canSend = c.status === 'draft' || c.status === 'scheduled' || c.status === 'paused';
          return (
            <ActionMenu
              items={[
                {
                  label: 'Edit',
                  icon: Edit,
                  onSelect: () => router.push(`/marketing/email/campaigns/${c._id}`),
                },
                ...(canSend
                  ? [{ label: 'Send Now', icon: Play, onSelect: () => void handleAction(c._id, 'send') }]
                  : []),
                ...(c.status === 'sending'
                  ? [{ label: 'Pause', icon: Pause, onSelect: () => void handleAction(c._id, 'pause') }]
                  : []),
                {
                  label: 'Delete',
                  icon: Trash2,
                  danger: true,
                  separatorBefore: true,
                  onSelect: () => setConfirmId(c._id),
                },
              ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router],
  );

  return (
    <ModuleShell
      title="Campaigns"
      icon={Send}
      contentClassName="flex flex-col gap-3 pb-8"
      primaryAction={
        <Button variant="brand" icon={Plus} onClick={() => router.push('/marketing/email/campaigns/new')}>
          New campaign
        </Button>
      }
      filterBar={
        <SearchInput
          placeholder="Search campaigns…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          wrapClassName="max-w-md"
        />
      }
      error={
        error
          ? {
              title: 'Failed to load campaigns',
              message: 'Unable to fetch email campaigns. Please try again.',
              onRetry: () => void refetch(),
            }
          : null
      }
    >
      <KpiRow
        items={[
          { icon: Send, label: 'Campaigns', value: summary.total, pastel: 'violet' },
          { icon: Play, label: 'Sending', value: summary.sending, pastel: 'mint' },
          { icon: Clock3, label: 'Scheduled', value: summary.scheduled, pastel: 'blue' },
          { icon: CheckCircle2, label: 'Completed', value: summary.completed, pastel: 'peach' },
        ]}
      />

      <Card bodyClassName="p-0">
        <DataTable
          columns={columns}
          data={campaigns}
          loading={isLoading}
          getRowId={(row) => row._id}
          emptyTitle="No campaigns found"
          emptyNote="Create the first email campaign to start seeing scheduled and sent activity here."
        />
      </Card>

      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={(open) => !open && setConfirmId(null)}
        title="Delete campaign?"
        description="This permanently removes the campaign and its delivery history. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (confirmId) await handleAction(confirmId, 'delete');
        }}
      />
    </ModuleShell>
  );
}
