'use client';

/**
 * UnifiedTimeline (B3-3.4)
 *
 * Replaces the activity-only timeline on the contact detail page with a
 * chronological mix of activities + 1:1 emails + WhatsApp messages + inbox
 * messages. Voice / social / form-submission rows light up automatically
 * when their producers start writing to the unified-timeline endpoint.
 */

import { useEffect, useState } from 'react';
import {
  Activity as ActivityIcon,
  Mail,
  MessageCircle,
  Inbox as InboxIcon,
  Phone,
  Globe,
  FileText,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface TimelineEvent {
  id: string;
  kind:
    | 'activity'
    | 'email'
    | 'whatsapp_message'
    | 'inbox_message'
    | 'voice_call'
    | 'social_interaction'
    | 'form_submission';
  channel: string;
  timestamp: string;
  title: string;
  snippet?: string;
  direction?: 'inbound' | 'outbound' | 'internal';
  href?: string;
  meta?: Record<string, unknown>;
}

interface TimelineResponse {
  events: TimelineEvent[];
  nextBefore: string | null;
  sourceCounts: Record<string, number>;
}

interface UnifiedTimelineProps {
  contactId: string;
}

const KIND_ICON: Record<TimelineEvent['kind'], typeof ActivityIcon> = {
  activity: ActivityIcon,
  email: Mail,
  whatsapp_message: MessageCircle,
  inbox_message: InboxIcon,
  voice_call: Phone,
  social_interaction: Globe,
  form_submission: FileText,
};

const KIND_LABEL: Record<TimelineEvent['kind'], string> = {
  activity: 'Activity',
  email: 'Email',
  whatsapp_message: 'WhatsApp',
  inbox_message: 'Inbox',
  voice_call: 'Call',
  social_interaction: 'Social',
  form_submission: 'Form',
};

export function UnifiedTimeline({ contactId }: UnifiedTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<TimelineEvent['kind'] | 'all'>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/v2/crm/contacts/${contactId}/unified-timeline?limit=25`, {
      credentials: 'include',
    })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<TimelineResponse>;
      })
      .then(data => {
        if (cancelled) return;
        setEvents(data.events);
        setNextBefore(data.nextBefore);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contactId]);

  const loadMore = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await fetch(`/api/v2/crm/contacts/${contactId}/unified-timeline?limit=25&before=${encodeURIComponent(nextBefore)}`, {
        credentials: 'include',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as TimelineResponse;
      setEvents(prev => [...prev, ...data.events]);
      setNextBefore(data.nextBefore);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered = kindFilter === 'all' ? events : events.filter(e => e.kind === kindFilter);
  const availableKinds = Array.from(new Set(events.map(e => e.kind)));

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map(i => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">Failed to load timeline: {error}</p>
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          No activity yet across any channel.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {availableKinds.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={kindFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setKindFilter('all')}
          >
            All
          </Button>
          {availableKinds.map(k => (
            <Button
              key={k}
              variant={kindFilter === k ? 'default' : 'outline'}
              size="sm"
              onClick={() => setKindFilter(k)}
            >
              {KIND_LABEL[k]}
            </Button>
          ))}
        </div>
      )}

      <ol className="space-y-2">
        {filtered.map(event => (
          <TimelineRow key={`${event.kind}:${event.id}`} event={event} />
        ))}
      </ol>

      {nextBefore && (
        <div className="flex justify-center pt-2">
          <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="size-4 animate-spin" /> : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  const Icon = KIND_ICON[event.kind] ?? ActivityIcon;
  const DirectionIcon = event.direction === 'inbound' ? ArrowDownLeft : event.direction === 'outbound' ? ArrowUpRight : null;
  const when = new Date(event.timestamp);

  const content = (
    <Card className="border-border/40 bg-card/60 backdrop-blur-md transition-colors hover:border-border">
      <CardContent className="flex gap-3 py-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{event.title}</span>
            {DirectionIcon ? <DirectionIcon className="size-3 text-muted-foreground" /> : null}
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              {KIND_LABEL[event.kind]}
            </Badge>
          </div>
          {event.snippet ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{event.snippet}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {when.toLocaleString()} · {event.channel}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  if (event.href) {
    return (
      <li>
        <a href={event.href} className="block focus-visible:outline-none">
          {content}
        </a>
      </li>
    );
  }
  return <li>{content}</li>;
}
