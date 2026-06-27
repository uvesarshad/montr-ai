'use client';

import useSWR from 'swr';
import { ArrowRightLeft, MessageSquare, Star, Users } from 'lucide-react';

import { Card, KpiTile, Spinner } from '@/components/ui-kit';

interface BotStats {
  window: { days: number };
  sessions: { total: number; open: number; resolved: number };
  messages: { total: number; inbound: number; aiReplies: number };
  handoff: { count: number; rate: number };
  csat: { average: number; count: number } | null;
  dailyVolume: Array<{ _id: string; count: number }>;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function MiniBar({ data }: { data: Array<{ _id: string; count: number }> }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex h-16 items-end gap-0.5">
      {data.map((d) => (
        <div
          key={d._id}
          className="flex-1 rounded-t bg-brand/70 transition-all"
          style={{ height: `${Math.max(4, (d.count / max) * 64)}px` }}
          title={`${d._id}: ${d.count}`}
        />
      ))}
    </div>
  );
}

export function BotStatsTab({ botId }: { botId: string }) {
  const { data, isLoading } = useSWR<BotStats>(`/api/v2/ai-bots/${botId}/stats?days=30`, fetcher);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="text-xs text-muted-foreground">Last 30 days</div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile icon={Users} iconTone="info" label="Sessions" value={data.sessions.total}>
          <div className="mt-1 text-xs text-muted-foreground">{data.sessions.open} open</div>
        </KpiTile>
        <KpiTile icon={MessageSquare} iconTone="brand" label="Messages" value={data.messages.inbound}>
          <div className="mt-1 text-xs text-muted-foreground">{data.messages.aiReplies} AI replies</div>
        </KpiTile>
        <KpiTile icon={ArrowRightLeft} iconTone="warn" label="Handoff rate" value={`${data.handoff.rate}%`}>
          <div className="mt-1 text-xs text-muted-foreground">{data.handoff.count} transferred</div>
        </KpiTile>
        <KpiTile
          icon={Star}
          iconTone="ok"
          label="CSAT"
          value={data.csat ? `${data.csat.average}/5` : '—'}
        >
          <div className="mt-1 text-xs text-muted-foreground">
            {data.csat ? `${data.csat.count} ratings` : 'No ratings yet'}
          </div>
        </KpiTile>
      </div>

      {data.dailyVolume.length > 0 ? (
        <Card title="Daily message volume">
          <div className="px-4 pb-4">
            <MiniBar data={data.dailyVolume} />
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
              <span>{data.dailyVolume[0]?._id}</span>
              <span>{data.dailyVolume[data.dailyVolume.length - 1]?._id}</span>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
