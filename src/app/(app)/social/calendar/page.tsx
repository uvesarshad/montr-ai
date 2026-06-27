'use client';

import { useRouter } from 'next/navigation';
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isToday,
  isSameDay,
  add,
  getDay,
  parseISO,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Plus, PanelRightOpen, GripVertical, Sparkles } from 'lucide-react';
import { Button, Card, Chip as KitChip, IconButton, Segmented, Select as KitSelect } from '@/components/ui-kit';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import Image from 'next/image';

import { useToast } from '@/hooks/use-toast';
import { ModuleShell } from '@/components/shell/module-shell';
import { Instagram, Youtube } from 'lucide-react';
import { LinkedinLogo, XLogo, FacebookLogo, RedditLogo, TelegramLogo, DribbbleLogo, ThreadsLogo, GoogleBusinessLogo } from '@/components/social-icons';
import { useSession } from '@/lib/auth-client';
import { DraftsSidebar } from '@/components/social/drafts-sidebar';

// DnD Kit imports
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  DragEndEvent,
  DragStartEvent,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import {
  buildDraftScheduledDate,
  buildRescheduledPostDate,
  socialCalendarCollisionDetection,
} from '@/lib/social/calendar-dnd';
import {
  restrictToWindowEdges,
  snapCenterToCursor,
} from '@dnd-kit/modifiers';

interface Brand {
  _id: string;
  name: string;
  handle: string;
}

interface ScheduledPost {
  id: string;
  brandId: string;
  content: string;
  mediaUrls: string[];
  platforms: {
    accountId: string;
    platform: string;
    platformUsername: string;
  }[];
  scheduledFor: string;
  timezone: string;
  status: 'pending_approval' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
  publishResults?: {
    platform: string;
    success: boolean;
    postUrl?: string;
    error?: string;
  }[];
  createdAt: string;
}

interface DraftDragItem {
  id: string;
  title: string;
  content: string;
}

type ActiveDragData =
  | { type: 'post'; post: ScheduledPost }
  | { type: 'draft'; draft: DraftDragItem }
  | null;

type CalendarView = 'month' | 'week' | 'day' | 'list';

interface BestTimeSlot {
  dayOfWeek: number;
  hour: number;
  score: number;
  samples: number;
}

interface BestTimesResult {
  overall: BestTimeSlot[];
  byPlatform: Record<string, BestTimeSlot[]>;
  fallback: boolean;
  analyzedPosts: number;
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong';

const getChannelIcon = (platform: string) => {
  const icons: Record<string, React.ReactNode> = {
    'instagram': <Instagram className="size-3" />,
    'linkedin': <LinkedinLogo className="size-3" />,
    'x': <XLogo className="size-3" />,
    'facebook': <FacebookLogo className="size-3" />,
    'youtube': <Youtube className="size-3" />,
    'reddit': <RedditLogo className="size-3" />,
    'telegram': <TelegramLogo className="size-3" />,
    'dribbble': <DribbbleLogo className="size-3" />,
    'threads': <ThreadsLogo className="size-3" />,
    'google_business': <GoogleBusinessLogo className="size-3" />,
  };
  return icons[platform] || <Clock className="size-3" />;
};

const statusColors: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  pending_approval: { bg: 'bg-secondary', text: 'text-muted-foreground', border: 'border-border', dot: 'bg-muted-foreground' },
  scheduled: { bg: 'bg-brand/10', text: 'text-brand', border: 'border-brand/20', dot: 'bg-brand' },
  publishing: { bg: 'bg-brand/10', text: 'text-brand', border: 'border-brand/20', dot: 'bg-brand' },
  published: { bg: 'bg-secondary', text: 'text-emerald-600', border: 'border-border', dot: 'bg-emerald-600' },
  failed: { bg: 'bg-secondary', text: 'text-red-600', border: 'border-border', dot: 'bg-red-600' },
  cancelled: { bg: 'bg-secondary', text: 'text-muted-foreground', border: 'border-border', dot: 'bg-muted-foreground' },
};

const PostCard = ({ post, onCancelPost }: { post: ScheduledPost; onCancelPost: (id: string) => void }) => {
  const colors = statusColors[post.status] || statusColors.scheduled;

  return (
    <Card className="w-80 overflow-hidden relative group">
      <div className="p-5 pb-3 space-y-1 border-b border-border">
        <div className="flex items-center justify-between">
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border",
            colors.bg, colors.text, colors.border
          )}>
            {post.status}
          </span>
          <div className="flex gap-1.5">
            {post.platforms.map(p => (
              <div key={p.accountId} className="p-1.5 rounded-full bg-background/80 shadow-sm border border-border/50 text-foreground" title={p.platformUsername}>
                {getChannelIcon(p.platform)}
              </div>
            ))}
          </div>
        </div>
        <p className="text-base font-bold leading-tight pt-3 text-foreground">
          {format(parseISO(post.scheduledFor), 'MMMM d, yyyy')}
        </p>
        <div className="flex items-center text-xs text-muted-foreground font-medium gap-1.5">
          <Clock className="size-3.5" />
          {format(parseISO(post.scheduledFor), 'h:mm a')}
        </div>
      </div>
      <div className="p-5 pt-4">
        {post.mediaUrls.length > 0 && (
          <div className="aspect-video relative mb-4 overflow-hidden rounded-lg bg-secondary border border-border">
            <Image src={post.mediaUrls[0]} alt="Post media" fill className="object-cover" />
          </div>
        )}
        <p className="text-sm text-foreground line-clamp-4 leading-relaxed p-3 rounded-xl border border-border bg-secondary font-medium">
          {post.content || <span className="italic text-muted-foreground">No caption provided</span>}
        </p>

        {post.publishResults && post.publishResults.length > 0 && (
          <div className="mt-4 space-y-2 p-3 rounded-xl bg-secondary border border-border">
            <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Publish Log</p>
            {post.publishResults.map((result) => (
              <div key={result.platform} className="flex items-center gap-2 text-xs font-medium">
                <div className="p-1 rounded border border-border bg-card">
                  {getChannelIcon(result.platform)}
                </div>
                {result.success ? (
                  <a href={result.postUrl || '#'} target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-emerald-500 hover:underline flex items-center gap-1">
                    Published <span className="text-[10px]">↗</span>
                  </a>
                ) : (
                  <span className="text-red-600 dark:text-red-500">{result.error || 'Failed'}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="p-5 pt-0 flex justify-end gap-2 relative z-10">
        {post.status === 'scheduled' && (
          <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold text-red-500 hover:text-red-600 hover:bg-red-500/10" onClick={() => onCancelPost(post.id)}>
            Cancel
          </Button>
        )}
      </div>
    </Card>
  );
};

// ----------------------------------------------------------------------
// DnD Components
// ----------------------------------------------------------------------

const DraggableScheduledPost = ({ post, onSelectPost }: { post: ScheduledPost, onSelectPost: (post: ScheduledPost, el: HTMLElement) => void }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `post-${post.id}`,
    data: {
      type: 'post',
      post,
    },
    disabled: post.status !== 'scheduled'
  });

  const colors = statusColors[post.status] || statusColors.scheduled;
  const cardRef = React.useRef<HTMLDivElement>(null);

  const handleClick = () => {
    // Only open popover on click, not on drag end
    if (cardRef.current) {
      onSelectPost(post, cardRef.current);
    }
  };

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
      className={cn(
        "text-left text-[10px] sm:text-xs px-2.5 py-2 rounded-md w-full border transition-all duration-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand/50 relative overflow-hidden group/btn",
        post.status === 'scheduled' ? "cursor-grab active:cursor-grabbing hover:scale-[1.01]" : "cursor-pointer",
        isDragging ? "opacity-30 scale-95" : "",
        colors.bg.replace('/10', '/30'), colors.text, colors.border
      )}
    >
      <div className={cn("absolute inset-0 opacity-0 group-hover/btn:opacity-20 transition-opacity duration-300 pointer-events-none", colors.dot)}></div>
      <div className="flex items-center gap-2 relative z-10 pointer-events-none">
        <div className={cn("size-2 rounded-full shrink-0 shadow-sm", colors.dot)} />
        <span className="truncate font-semibold tracking-wide">{post.content.slice(0, 25) || 'Untitled Post'}</span>
      </div>
    </div>
  );
};


const DroppableDateCell = ({ day, isCurrentDay, daysPosts, onSelectPost, bestSlots }: {
  day: Date;
  isCurrentDay: boolean;
  daysPosts: ScheduledPost[];
  onSelectPost: (post: ScheduledPost, el: HTMLElement) => void;
  bestSlots?: BestTimeSlot[];
}) => {
  const dateKey = format(day, 'yyyy-MM-dd');
  const { isOver, setNodeRef } = useDroppable({
    id: `date-${dateKey}`,
    data: {
      type: 'date',
      date: dateKey,
    },
  });

  // Only allow drop if it's today or in the future
  const isPast = day < new Date(new Date().setHours(0, 0, 0, 0));

  return (
    <div
      ref={isPast ? undefined : setNodeRef}
      className={cn(
        "group relative bg-background/40 border-b border-r border-border/20 p-2 sm:p-3 min-h-[120px] transition-all duration-300 flex flex-col gap-1.5",
        isPast ? "opacity-60 bg-muted/20" : "hover:bg-brand/5",
        isOver && !isPast ? "bg-brand/10 ring-2 ring-brand ring-inset z-10" : ""
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span
          className={cn(
            'size-8 flex items-center justify-center rounded-full text-sm font-semibold transition-all duration-300',
            isCurrentDay
              ? 'bg-brand text-white shadow-lg shadow-brand/30 scale-110 ring-2 ring-background'
              : 'text-muted-foreground group-hover:text-foreground group-hover:bg-background/80 group-hover:shadow-sm'
          )}
        >
          {format(day, 'd')}
        </span>
        {!isPast && bestSlots && bestSlots.length > 0 && (
          <BestTimeDot slots={bestSlots} />
        )}
        {daysPosts.length > 0 && (
          <span className="text-[10px] font-bold tracking-wider text-muted-foreground bg-background/50 px-1.5 py-0.5 rounded-sm border border-border/30 opacity-60 group-hover:opacity-100 transition-opacity">
            {daysPosts.length} POST{daysPosts.length > 1 ? 'S' : ''}
          </span>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-0.5 pointer-events-auto">
        {daysPosts.map(post => (
          <DraggableScheduledPost key={post.id} post={post} onSelectPost={onSelectPost} />
        ))}
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// Best-time overlay helpers
// ----------------------------------------------------------------------

/** Index best-time slots by day-of-week for quick lookup; track the best hours per day. */
function buildBestTimeIndex(slots: BestTimeSlot[]) {
  const byDay = new Map<number, BestTimeSlot[]>();
  for (const slot of slots) {
    const list = byDay.get(slot.dayOfWeek) || [];
    list.push(slot);
    byDay.set(slot.dayOfWeek, list);
  }
  return byDay;
}

const BestTimeDot = ({ slots }: { slots: BestTimeSlot[] }) => {
  if (!slots.length) return null;
  const hours = Array.from(new Set(slots.map((s) => s.hour))).sort((a, b) => a - b);
  const label = hours
    .map((h) => format(new Date(2000, 0, 1, h), 'h a'))
    .join(', ');
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex size-2 shrink-0 rounded-full bg-brand/70 ring-1 ring-brand/30"
            aria-label="Recommended time to post"
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-xs">
          Good time to post (based on your engagement){hours.length ? ` — ${label}` : ''}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Compact post chip used in week / day / list views (no DnD — click to preview).
const CompactPostCard = ({ post, onSelectPost }: {
  post: ScheduledPost;
  onSelectPost: (post: ScheduledPost, el: HTMLElement) => void;
}) => {
  const colors = statusColors[post.status] || statusColors.scheduled;
  const ref = React.useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => ref.current && onSelectPost(post, ref.current)}
      className={cn(
        'flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-[11px] transition-all hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/50',
        colors.bg.replace('/10', '/30'), colors.text, colors.border
      )}
    >
      <span className={cn('size-2 shrink-0 rounded-full', colors.dot)} />
      <span className="flex items-center gap-1 text-[10px] font-semibold tabular-nums opacity-80">
        <Clock className="size-3" />
        {format(parseISO(post.scheduledFor), 'h:mm a')}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">
        {post.content.slice(0, 40) || 'Untitled Post'}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {post.platforms.slice(0, 3).map((p) => (
          <span key={p.accountId} className="text-current/80" title={p.platformUsername}>
            {getChannelIcon(p.platform)}
          </span>
        ))}
      </span>
    </button>
  );
};

// ----------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------

export default function SocialCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedBrandId, setSelectedBrandId] = useState<string>('all');
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // View switcher + best-time overlay
  const [view, setView] = useState<CalendarView>('month');
  const [showBestTimes, setShowBestTimes] = useState(true);
  const [bestTimes, setBestTimes] = useState<BestTimesResult | null>(null);

  // Selected post for preview popover (rendered outside DnD tree)
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);

  const handleSelectPost = useCallback((post: ScheduledPost, el: HTMLElement) => {
    if (selectedPost?.id === post.id) {
      setSelectedPost(null);
      setPopoverAnchor(null);
    } else {
      setSelectedPost(post);
      setPopoverAnchor(el);
    }
  }, [selectedPost]);

  // DnD State
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeData, setActiveData] = useState<ActiveDragData>(null);

  // Require distance constraint to distinguish click from drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const { data: session } = useSession();
  const { toast, dismiss } = useToast();
  const { push } = useRouter();

  const { firstDayOfMonth, lastDayOfMonth } = useMemo(() => ({
    firstDayOfMonth: startOfMonth(currentDate),
    lastDayOfMonth: endOfMonth(currentDate),
  }), [currentDate]);

  // Visible range driving the fetch — widens for week/day/list views.
  const { rangeStart, rangeEnd } = useMemo(() => {
    switch (view) {
      case 'week':
        return { rangeStart: startOfWeek(currentDate), rangeEnd: endOfWeek(currentDate) };
      case 'day': {
        const start = new Date(currentDate); start.setHours(0, 0, 0, 0);
        const end = new Date(currentDate); end.setHours(23, 59, 59, 999);
        return { rangeStart: start, rangeEnd: end };
      }
      case 'list': {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        return { rangeStart: start, rangeEnd: add(start, { days: 30 }) };
      }
      case 'month':
      default:
        return { rangeStart: firstDayOfMonth, rangeEnd: lastDayOfMonth };
    }
  }, [view, currentDate, firstDayOfMonth, lastDayOfMonth]);

  const fetchPosts = useCallback(async () => {
    if (!session?.user) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        fromDate: rangeStart.toISOString(),
        toDate: rangeEnd.toISOString(),
      });

      if (selectedBrandId && selectedBrandId !== 'all') {
        params.append('brandId', selectedBrandId);
      }

      const response = await fetch(`/api/social/posts/scheduled?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch posts');
      }

      setPosts(data.posts || []);
    } catch (err: unknown) {
      console.error('Failed to fetch scheduled posts:', err);
      const message = getErrorMessage(err);
      setError(message);
      toast({
        variant: 'destructive',
        title: 'Failed to load calendar',
        description: message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [session, rangeStart, rangeEnd, selectedBrandId, toast]);

  // Fetch brands
  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ['social-brands'],
    queryFn: async () => {
      const response = await fetch('/api/social/brands');
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return data.brands || [];
    },
  });

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Best-time recommendations require a concrete brand (not "all").
  useEffect(() => {
    if (!selectedBrandId || selectedBrandId === 'all') {
      setBestTimes(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/social/analytics/best-times?brandId=${encodeURIComponent(selectedBrandId)}`);
        if (!res.ok) { if (!cancelled) setBestTimes(null); return; }
        const data: BestTimesResult = await res.json();
        if (!cancelled) setBestTimes(data);
      } catch {
        if (!cancelled) setBestTimes(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedBrandId]);

  const handleCancelPost = async (postId: string) => {
    try {
      const response = await fetch(`/api/social/posts/scheduled?id=${postId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to cancel post');
      }

      toast({ title: 'Post Cancelled', description: 'The scheduled post has been cancelled.' });
      fetchPosts(); // Refresh
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Failed to cancel', description: getErrorMessage(err) });
    }
  };

  const handleCreatePost = useCallback(() => {
    push('/social/create-post');
  }, [push]);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  // View-aware navigation (month view keeps its existing month stepping).
  const goPrevious = useCallback(() => {
    setCurrentDate((prev) => {
      switch (view) {
        case 'week': return add(prev, { weeks: -1 });
        case 'day': return add(prev, { days: -1 });
        default: return add(prev, { months: -1 });
      }
    });
  }, [view]);

  const goNext = useCallback(() => {
    setCurrentDate((prev) => {
      switch (view) {
        case 'week': return add(prev, { weeks: 1 });
        case 'day': return add(prev, { days: 1 });
        default: return add(prev, { months: 1 });
      }
    });
  }, [view]);

  // Index best-time slots by day-of-week for the overlay.
  const bestTimeByDay = useMemo(
    () => (showBestTimes && bestTimes ? buildBestTimeIndex(bestTimes.overall) : new Map<number, BestTimeSlot[]>()),
    [showBestTimes, bestTimes]
  );

  const navLabel = useMemo(() => {
    switch (view) {
      case 'week': {
        const ws = startOfWeek(currentDate);
        const we = endOfWeek(currentDate);
        return `${format(ws, 'MMM d')} – ${format(we, 'MMM d')}`;
      }
      case 'day': return format(currentDate, 'EEE, MMM d');
      case 'list': return 'Next 30 days';
      default: return format(currentDate, 'MMMM yyyy');
    }
  }, [view, currentDate]);


  const daysInMonth = useMemo(() =>
    eachDayOfInterval({
      start: firstDayOfMonth,
      end: lastDayOfMonth,
    }), [firstDayOfMonth, lastDayOfMonth]
  );

  const startingDayIndex = getDay(firstDayOfMonth);

  const postsByDate = useMemo(() => {
    const grouped: { [key: string]: ScheduledPost[] } = {};
    posts.forEach(post => {
      try {
        const dateKey = format(parseISO(post.scheduledFor), 'yyyy-MM-dd');
        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }
        grouped[dateKey].push(post);
      } catch {
        console.error("Error parsing date for post", post);
      }
    });
    return grouped;
  }, [posts]);

  // Days of the current week (Sun–Sat) for the Week view.
  const daysInWeek = useMemo(() => {
    const ws = startOfWeek(currentDate);
    return eachDayOfInterval({ start: ws, end: endOfWeek(currentDate) });
  }, [currentDate]);

  // Posts for the focused day (Day view), chronologically ordered.
  const dayPosts = useMemo(() => {
    const key = format(currentDate, 'yyyy-MM-dd');
    return (postsByDate[key] || [])
      .slice()
      .sort((a, b) => parseISO(a.scheduledFor).getTime() - parseISO(b.scheduledFor).getTime());
  }, [postsByDate, currentDate]);

  // Upcoming posts (List view): from now, sorted, grouped by date.
  const upcomingByDate = useMemo(() => {
    const now = Date.now();
    const upcoming = posts
      .filter((p) => {
        const t = parseISO(p.scheduledFor).getTime();
        return !isNaN(t) && t >= new Date().setHours(0, 0, 0, 0);
      })
      .sort((a, b) => parseISO(a.scheduledFor).getTime() - parseISO(b.scheduledFor).getTime());
    void now;
    const groups: { dateKey: string; date: Date; items: ScheduledPost[] }[] = [];
    const index = new Map<string, number>();
    for (const p of upcoming) {
      const d = parseISO(p.scheduledFor);
      const key = format(d, 'yyyy-MM-dd');
      if (!index.has(key)) {
        index.set(key, groups.length);
        groups.push({ dateKey: key, date: d, items: [] });
      }
      groups[index.get(key)!].items.push(p);
    }
    return groups;
  }, [posts]);

  // DnD Handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setActiveData(event.active.data.current as ActiveDragData);
    // Close any open popover when dragging starts
    setSelectedPost(null);
    setPopoverAnchor(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    setActiveData(null);
    const { active, over } = event;

    if (!over) return;

    const overData = over.data.current;

    // Handle post dropped on the Drafts Sidebar
    if (overData?.type === 'sidebar') {
      if (active.data.current?.type === 'post') {
         const post = active.data.current.post as ScheduledPost;
         
         const { id: loadingToastId } = toast({ 
           title: 'Converting to Draft...', 
           description: 'Please wait.',
           duration: 100000, 
         });

         try {
           const res = await fetch('/api/social/posts/draft-from-scheduled', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ postId: post.id })
           });

           const data = await res.json();
           dismiss(loadingToastId);

           if (!res.ok) throw new Error(data.error || 'Failed to convert post to draft');
           
           toast({ title: 'Post converted to Draft!', description: 'The scheduled post was successfully converted and removed from the calendar.', variant: "default" });
           fetchPosts(); // Refresh calendar
           window.dispatchEvent(new CustomEvent('refresh-drafts')); // Refresh sidebar
         } catch (error: unknown) {
           dismiss(loadingToastId);
           toast({ variant: 'destructive', title: 'Conversion Error', description: getErrorMessage(error) });
         }
      }
      return; // Stop processing if dropped on the sidebar
    }

    if (overData?.type !== 'date') return;

    const droppedDateStr = overData.date; // yyyy-MM-dd
    const parsedDate = parseISO(droppedDateStr);
    const now = new Date();
    
    if (active.data.current?.type === 'post') {
      const post = active.data.current.post as ScheduledPost;
      const originalDate = parseISO(post.scheduledFor);
      const newScheduledDate = buildRescheduledPostDate({
        originalScheduledFor: originalDate,
        targetDate: parsedDate,
        now,
      });

      if (!newScheduledDate) return;

      try {
        const res = await fetch('/api/social/posts/scheduled', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: post.id,
            scheduledFor: newScheduledDate.toISOString()
          })
        });

        if (!res.ok) throw new Error('Failed to reschedule');
        toast({ title: 'Post Rescheduled', description: `Moved to ${format(newScheduledDate, 'PPP p')}` });
        fetchPosts();
      } catch {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not reschedule the post.' });
      }

    } else if (active.data.current?.type === 'draft') {
      const draft = active.data.current.draft;
      const scheduledDate = buildDraftScheduledDate({
        targetDate: parsedDate,
        now,
      });

      const { id: loadingToastId } = toast({ 
        title: 'Scheduling Post...', 
        description: 'Please wait.',
        duration: 100000, 
      });
      
      try {
        const res = await fetch('/api/social/posts/schedule-from-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draftId: draft.id,
            scheduledFor: scheduledDate.toISOString()
          })
        });

        const data = await res.json();
        
        dismiss(loadingToastId);

        if (!res.ok) throw new Error(data.error || 'Failed to schedule draft');
        
        toast({ title: 'Draft Scheduled!', description: `Scheduled for ${format(scheduledDate, 'PPP p')}`, variant: "default" });
        fetchPosts(); // Refreshes calendar
        
        // Notify DraftsSidebar to refresh
        window.dispatchEvent(new CustomEvent('refresh-drafts'));

      } catch (error: unknown) {
        dismiss(loadingToastId);
        toast({ variant: 'destructive', title: 'Schedule Error', description: getErrorMessage(error) });
      }
    }
  };


  const filterBar = (
    <div className="flex flex-wrap items-center gap-2">
      {brands.length > 0 && (
        <KitSelect
          value={selectedBrandId}
          onChange={setSelectedBrandId}
          triggerClassName="w-[180px] h-9"
          placeholder="All Brands"
          options={[
            { value: 'all', label: 'All Brands' },
            ...brands.map((brand) => ({ value: brand._id, label: brand.name })),
          ]}
        />
      )}

      <Segmented
        value={view}
        onChange={(v) => setView(v as CalendarView)}
        options={[
          { value: 'month', label: 'Month' },
          { value: 'week', label: 'Week' },
          { value: 'day', label: 'Day' },
          { value: 'list', label: 'List' },
        ]}
      />

      {/* Best-time overlay toggle (Month + Week only) */}
      {(view === 'month' || view === 'week') && (
        <Button
          variant={showBestTimes ? 'outline' : 'ghost'}
          size="sm"
          icon={Sparkles}
          onClick={() => setShowBestTimes((s) => !s)}
          className={cn('h-9', showBestTimes && 'border-brand/40 text-brand')}
          title={
            selectedBrandId === 'all'
              ? 'Select a brand to see best-time recommendations'
              : 'Toggle recommended posting-time markers'
          }
        >
          Best times
        </Button>
      )}

      <Button variant="outline" size="sm" onClick={goToToday} className="hidden sm:flex">Today</Button>
      {view !== 'list' && (
        <div className="flex items-center bg-muted rounded-md border border-input h-9 px-1">
          <IconButton icon={ChevronLeft} iconSize={16} className="size-7" onClick={goPrevious} aria-label="Previous" />
          <span className="text-sm font-medium w-36 text-center tabular-nums">
            {navLabel}
          </span>
          <IconButton icon={ChevronRight} iconSize={16} className="size-7" onClick={goNext} aria-label="Next" />
        </div>
      )}
    </div>
  );

  return (
    <ModuleShell
      title="Calendar"
      icon={CalendarDays}
      meta={
        selectedBrandId === 'all'
          ? `${posts.length} scheduled posts`
          : `${brands.find((b) => b._id === selectedBrandId)?.name || 'Brand'} · ${posts.length} scheduled posts`
      }
      primaryAction={
        <Button variant="brand" size="sm" icon={Plus} onClick={handleCreatePost}>
          New post
        </Button>
      }
      filterBar={filterBar}
      isLoading={isLoading}
      error={error ? { title: 'Error Loading Calendar', message: error, onRetry: fetchPosts } : null}
      contentClassName="min-h-0 flex-1 flex flex-col"
    >
    <DndContext
      sensors={sensors}
      collisionDetection={socialCalendarCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
        <div className="relative flex w-full min-h-0 flex-1 gap-5 animate-in fade-in duration-500">

          {/* Main Calendar Area */}
          <div className="flex h-full min-w-0 flex-1 flex-col">
            {/* Stats Bar */}
            <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
              <KitChip tone="info" dot className="shrink-0">
                Scheduled: {posts.filter(p => p.status === 'scheduled').length}
              </KitChip>
              <KitChip tone="ok" dot className="shrink-0">
                Published: {posts.filter(p => p.status === 'published').length}
              </KitChip>
              <KitChip tone="danger" dot className="shrink-0">
                Failed: {posts.filter(p => p.status === 'failed').length}
              </KitChip>
            </div>

            {/* ---------------------------------------------------- MONTH */}
            {view === 'month' && (
              <>
                {/* Weekday Header */}
                <div className="mb-2 grid grid-cols-7 shrink-0">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <div key={day} className="py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid h-full flex-1 grid-cols-7 overflow-hidden rounded-xl border border-border bg-card">
                  {/* Empty cells for previous month */}
                  {Array.from({ length: startingDayIndex }).map((_, i) => (
                    <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-border/20 bg-background/10" />
                  ))}

                  {daysInMonth.map((day) => {
                    const dateKey = format(day, 'yyyy-MM-dd');
                    const daysPosts = postsByDate[dateKey] || [];
                    const isCurrentDay = isToday(day);

                    return (
                      <DroppableDateCell
                        key={day.toString()}
                        day={day}
                        isCurrentDay={isCurrentDay}
                        daysPosts={daysPosts}
                        onSelectPost={handleSelectPost}
                        bestSlots={bestTimeByDay.get(getDay(day))}
                      />
                    );
                  })}

                  {/* Fill remaining cells to complete the grid */}
                  {Array.from({ length: (7 - (getDay(lastDayOfMonth) + 1)) % 7 }).map((_, i) => (
                    <div key={`empty-end-${i}`} className="min-h-[100px] border-b border-r border-border/20 bg-background/10" />
                  ))}
                </div>
              </>
            )}

            {/* ----------------------------------------------------- WEEK */}
            {view === 'week' && (
              <div className="grid h-full flex-1 grid-cols-7 overflow-hidden rounded-xl border border-border bg-card">
                {daysInWeek.map((day) => {
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const daysPosts = (postsByDate[dateKey] || [])
                    .slice()
                    .sort((a, b) => parseISO(a.scheduledFor).getTime() - parseISO(b.scheduledFor).getTime());
                  const isCurrentDay = isToday(day);
                  const isPast = day < new Date(new Date().setHours(0, 0, 0, 0));
                  const bestSlots = bestTimeByDay.get(getDay(day));
                  return (
                    <div
                      key={dateKey}
                      className={cn(
                        'flex min-h-0 flex-col border-r border-border/20 last:border-r-0',
                        isPast ? 'bg-muted/20' : ''
                      )}
                    >
                      <div className="flex items-center justify-between border-b border-border/20 px-2 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {format(day, 'EEE')}
                          </span>
                          <span
                            className={cn(
                              'flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                              isCurrentDay ? 'bg-brand text-white' : 'text-foreground'
                            )}
                          >
                            {format(day, 'd')}
                          </span>
                        </div>
                        {!isPast && bestSlots && bestSlots.length > 0 && <BestTimeDot slots={bestSlots} />}
                      </div>
                      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-2">
                        {daysPosts.length === 0 ? (
                          <span className="px-1 py-2 text-[10px] text-muted-foreground/60">No posts</span>
                        ) : (
                          daysPosts.map((post) => (
                            <CompactPostCard key={post.id} post={post} onSelectPost={handleSelectPost} />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ------------------------------------------------------ DAY */}
            {view === 'day' && (
              <div className="flex h-full flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <h3 className="text-sm font-semibold text-foreground">{format(currentDate, 'EEEE, MMMM d, yyyy')}</h3>
                  <span className="text-xs text-muted-foreground">{dayPosts.length} post{dayPosts.length === 1 ? '' : 's'}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {dayPosts.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                      <CalendarDays className="size-8 opacity-40" />
                      <p className="text-sm">No posts scheduled for this day.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {dayPosts.map((post) => (
                        <div key={post.id} className="flex items-center gap-3">
                          <span className="w-16 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
                            {format(parseISO(post.scheduledFor), 'h:mm a')}
                          </span>
                          <div className="min-w-0 flex-1">
                            <CompactPostCard post={post} onSelectPost={handleSelectPost} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ----------------------------------------------------- LIST */}
            {view === 'list' && (
              <div className="flex h-full flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <h3 className="text-sm font-semibold text-foreground">Upcoming posts · next 30 days</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {upcomingByDate.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                      <CalendarDays className="size-8 opacity-40" />
                      <p className="text-sm">No upcoming posts in the next 30 days.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-5">
                      {upcomingByDate.map((group) => (
                        <div key={group.dateKey}>
                          <div className="mb-2 flex items-center gap-2">
                            <span className={cn(
                              'text-xs font-semibold uppercase tracking-wider',
                              isSameDay(group.date, new Date()) ? 'text-brand' : 'text-muted-foreground'
                            )}>
                              {isSameDay(group.date, new Date()) ? 'Today' : format(group.date, 'EEEE, MMMM d')}
                            </span>
                            <span className="h-px flex-1 bg-border" />
                            <span className="text-[10px] text-muted-foreground">{group.items.length} post{group.items.length === 1 ? '' : 's'}</span>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {group.items.map((post) => (
                              <CompactPostCard key={post.id} post={post} onSelectPost={handleSelectPost} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar Area */}
          <div className={cn("relative hidden h-full shrink-0 transition-all duration-300 ease-in-out lg:block", isSidebarCollapsed ? "w-0 overflow-visible opacity-100" : "w-80 opacity-100")}>
            {isSidebarCollapsed && (
              <Button
                variant="outline"
                size="sm"
                icon={PanelRightOpen}
                className="absolute -left-12 top-4 z-50 size-10 !px-0 rounded-full border-border bg-card text-muted-foreground shadow-md transition-colors hover:text-foreground"
                onClick={() => setIsSidebarCollapsed(false)}
                title="Expand Drafts Sidebar"
              />
            )}

            <div className={cn("absolute top-0 right-0 h-full w-80 transition-all duration-300", isSidebarCollapsed ? "origin-right scale-95 pointer-events-none opacity-0" : "origin-right scale-100 opacity-100")}>
              <DraftsSidebar
                brandId={selectedBrandId}
                className="border border-border rounded-xl"
                onToggleCollapse={() => setIsSidebarCollapsed(true)}
              />
            </div>
          </div>
        </div>

      {isClient && createPortal(
        <DragOverlay
          dropAnimation={null}
          modifiers={[snapCenterToCursor, restrictToWindowEdges]}
        >
          {activeId ? (
            activeData?.type === 'post' ? (
              <div className="bg-brand text-white border border-brand/80 px-3 py-2 rounded-lg shadow-lg opacity-90 min-w-[200px] pointer-events-none">
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-white shrink-0" />
                  <span className="truncate font-semibold tracking-wide text-xs">{activeData.post.content.slice(0, 30) || 'Untitled Post'}</span>
                </div>
              </div>
            ) : activeData?.type === 'draft' ? (
              <div className="w-72 bg-card border border-border shadow-lg rounded-xl p-4 opacity-95 pointer-events-none">
                 <div className="flex items-center gap-2 mb-2">
                   <GripVertical className="size-4 text-muted-foreground" />
                   <h4 className="font-bold text-sm truncate">{activeData.draft.title}</h4>
                 </div>
                 <p className="text-xs text-muted-foreground line-clamp-2 mt-1 pl-6">{activeData.draft.content}</p>
              </div>
            ) : null
          ) : null}
        </DragOverlay>,
        document.body
      )}

      {/* Standalone Post Preview Popover - rendered outside the draggable tree */}
      {selectedPost && popoverAnchor && (
        <Popover open={true} onOpenChange={(open) => { if (!open) { setSelectedPost(null); setPopoverAnchor(null); } }}>
          <PopoverTrigger asChild>
            <span className="hidden" />
          </PopoverTrigger>
          <PopoverContent
            className="p-0 border-none bg-transparent shadow-none w-80 z-50"
            side="right"
            align="start"
            style={{
              position: 'fixed',
              left: popoverAnchor.getBoundingClientRect().right + 8,
              top: popoverAnchor.getBoundingClientRect().top,
            }}
          >
            <PostCard post={selectedPost} onCancelPost={(id) => { handleCancelPost(id); setSelectedPost(null); setPopoverAnchor(null); }} />
          </PopoverContent>
        </Popover>
      )}
    </DndContext>
    </ModuleShell>
  );
}
