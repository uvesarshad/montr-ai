'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { format, isToday, isTomorrow } from 'date-fns';
import { CalendarDays, Globe, Instagram, Plus, User, Youtube } from 'lucide-react';
import {
  DashboardEmptyState,
  DashboardPanel,
  DashboardPanelHeader,
} from '@/components/dashboard/dashboard-primitives';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  FacebookLogo,
  GoogleBusinessLogo,
  LinkedinLogo,
  PinterestLogo,
  RedditLogo,
  TelegramLogo,
  ThreadsLogo,
  WhatsAppLogo,
  XLogo,
  DribbbleLogo,
} from '@/components/social-icons';

type BrandPreview = {
  _id: string;
  name: string;
  handle?: string;
  avatarUrl?: string;
};

type SocialAccountPreview = {
  _id: string;
  platform: string;
  platformDisplayName?: string;
  platformUsername?: string;
  isActive?: boolean;
};

type ScheduledPostPreview = {
  _id: string;
  content?: string;
  scheduledFor: string | Date;
  platforms?: Array<{
    platform?: string;
  }>;
};

const getPlatformIcon = (platform: string, className?: string) => {
  switch (platform?.toLowerCase()) {
    case 'linkedin':
      return <LinkedinLogo className={className} />;
    case 'x':
    case 'twitter':
      return <XLogo className={className} />;
    case 'facebook':
      return <FacebookLogo className={className} />;
    case 'instagram':
      return <Instagram className={className} />;
    case 'telegram':
      return <TelegramLogo className={className} />;
    case 'google_business':
      return <GoogleBusinessLogo className={className} />;
    case 'dribbble':
      return <DribbbleLogo className={className} />;
    case 'threads':
      return <ThreadsLogo className={className} />;
    case 'pinterest':
      return <PinterestLogo className={className} />;
    case 'whatsapp':
      return <WhatsAppLogo className={className} />;
    case 'youtube':
      return <Youtube className={className} />;
    case 'reddit':
      return <RedditLogo className={className} />;
    default:
      return <Globe className={className} />;
  }
};

export function RecentSocial() {
  const { data: brandsData, isLoading: isBrandsLoading } = useQuery<{ brands?: BrandPreview[] }>({
    queryKey: ['social-brands'],
    queryFn: async () => {
      const res = await fetch('/api/social/brands');
      if (!res.ok) throw new Error('Failed to fetch brands');
      return res.json();
    },
  });

  const brands = brandsData?.brands || [];

  const { data: accountsData, isLoading: isAccountsLoading } = useQuery<SocialAccountPreview[]>({
    queryKey: ['social-accounts', brands.map((brand) => brand._id).join(',')],
    queryFn: async () => {
      if (!brands.length) return [];
      const results = await Promise.all(
        brands.map((brand) =>
          fetch(`/api/social/brands/${brand._id}/accounts`).then((res) => res.json())
        )
      );
      return results.flatMap((result: { accounts?: SocialAccountPreview[] }) => result.accounts || []);
    },
    enabled: brands.length > 0,
  });

  const accounts = accountsData || [];

  const { data: postsData, isLoading: isPostsLoading } = useQuery<{ posts?: ScheduledPostPreview[] }>({
    queryKey: ['scheduled-posts'],
    queryFn: async () => {
      const res = await fetch('/api/social/posts/scheduled');
      if (!res.ok) throw new Error('Failed to fetch posts');
      return res.json();
    },
  });

  const posts = postsData?.posts || [];
  const todayPosts = posts.filter((post) => isToday(new Date(post.scheduledFor)));
  const tomorrowPosts = posts.filter((post) => isTomorrow(new Date(post.scheduledFor)));
  const isLoading =
    isBrandsLoading || (brands.length > 0 && isAccountsLoading && !accountsData) || isPostsLoading;

  return (
    <DashboardPanel>
      <DashboardPanelHeader
        eyebrow="Social"
        title="Publishing Overview"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/social/calendar">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-[0.4rem] border-border/60 bg-background/70 px-3 text-xs"
              >
                <CalendarDays className="size-3.5" />
                Calendar
              </Button>
            </Link>
            <Link href="/social/create-post">
              <Button size="sm" className="h-8 rounded-[0.4rem] px-3 text-xs">
                <Plus className="size-3.5" />
                Create
              </Button>
            </Link>
          </div>
        }
      />

      <CardContent className="p-0">
        {isLoading ? (
          <div className="grid gap-4 px-5 py-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="space-y-3 rounded-[12px] border border-border/60 bg-background/60 p-4"
              >
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-11 w-full rounded-[12px]" />
                <Skeleton className="h-11 w-full rounded-[12px]" />
                <Skeleton className="h-11 w-full rounded-[12px]" />
              </div>
            ))}
          </div>
        ) : !brands.length && !accounts.length && !posts.length ? (
          <DashboardEmptyState
            icon={CalendarDays}
            title="No social activity yet"
            description="Connect a brand or schedule the first post to turn this panel into a live publishing overview."
            actionHref="/social/calendar"
            actionLabel="Open Social"
          />
        ) : (
          <div className="grid gap-4 px-5 py-4 lg:grid-cols-3">
            <div className="rounded-[12px] border border-border/60 bg-background/60">
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                <div className="flex items-center gap-2">
                  <User className="size-4 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">Connected Brands</p>
                </div>
                <Badge
                  variant="outline"
                  className="rounded-full border-border/60 bg-background/70 text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
                >
                  {brands.length}
                </Badge>
              </div>
              <ScrollArea className="h-[230px]">
                <div className="space-y-2 p-3">
                  {brands.length > 0 ? (
                    brands.map((brand) => (
                      <div
                        key={brand._id}
                        className="flex items-center gap-3 rounded-[12px] border border-border/50 bg-background/70 px-3 py-3"
                      >
                        <Avatar className="size-9 border border-border/60">
                          <AvatarImage src={brand.avatarUrl} />
                          <AvatarFallback>{brand.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{brand.name}</p>
                          <p className="truncate text-xs text-muted-foreground">@{brand.handle}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                      No brands connected yet.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="rounded-[12px] border border-border/60 bg-background/60">
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Globe className="size-4 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">Active Accounts</p>
                </div>
                <Badge
                  variant="outline"
                  className="rounded-full border-border/60 bg-background/70 text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
                >
                  {accounts.length}
                </Badge>
              </div>
              <ScrollArea className="h-[230px]">
                <div className="space-y-2 p-3">
                  {accounts.length > 0 ? (
                    accounts.map((account) => (
                      <div
                        key={account._id}
                        className="flex items-center gap-3 rounded-[12px] border border-border/50 bg-background/70 px-3 py-3"
                      >
                        <div className="flex size-9 items-center justify-center rounded-[12px] bg-muted/60 text-muted-foreground">
                          {getPlatformIcon(account.platform, 'size-4')}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {account.platformDisplayName || account.platformUsername}
                          </p>
                          <p className="truncate text-xs capitalize text-muted-foreground">
                            {account.platform}
                          </p>
                        </div>
                        {account.isActive ? (
                          <span className="size-2.5 rounded-full bg-emerald-500" />
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                      No accounts connected yet.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="rounded-[12px] border border-border/60 bg-background/60">
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">Scheduled Queue</p>
                </div>
                <Badge
                  variant="outline"
                  className="rounded-full border-border/60 bg-background/70 text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
                >
                  {todayPosts.length + tomorrowPosts.length}
                </Badge>
              </div>
              <ScrollArea className="h-[230px]">
                <div className="space-y-4 p-3">
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                      Today
                    </p>
                    {todayPosts.length > 0 ? (
                      todayPosts.map((post) => (
                        <div
                          key={post._id}
                          className="rounded-[12px] border border-border/50 bg-background/70 px-3 py-3"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 text-muted-foreground">
                              {getPlatformIcon(post.platforms?.[0]?.platform || 'default', 'size-3.5')}
                            </div>
                            <div className="min-w-0 flex-1 space-y-2">
                              <p className="line-clamp-2 text-xs leading-5 text-foreground">
                                {post.content || 'No content'}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {format(new Date(post.scheduledFor), 'h:mm a')}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">No posts scheduled for today.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                      Tomorrow
                    </p>
                    {tomorrowPosts.length > 0 ? (
                      tomorrowPosts.map((post) => (
                        <div
                          key={post._id}
                          className="rounded-[12px] border border-border/50 bg-background/70 px-3 py-3"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 text-muted-foreground">
                              {getPlatformIcon(post.platforms?.[0]?.platform || 'default', 'size-3.5')}
                            </div>
                            <div className="min-w-0 flex-1 space-y-2">
                              <p className="line-clamp-2 text-xs leading-5 text-foreground">
                                {post.content || 'No content'}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {format(new Date(post.scheduledFor), 'h:mm a')}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">No posts scheduled for tomorrow.</p>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </CardContent>
    </DashboardPanel>
  );
}
