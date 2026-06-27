'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Medal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LeaderboardEntry {
  userId: string;
  userName: string;
  userAvatar?: string;
  dealsWon: number;
  dealValue: number;
  activitiesCompleted: number;
  winRate: number;
  rank: number;
}

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  loading?: boolean;
  period?: string;
}

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getRankBadge(rank: number) {
  if (rank === 1) {
    return (
      <div className="flex items-center justify-center size-8 rounded-full bg-yellow-500/20">
        <Trophy className="size-4 text-yellow-600" />
      </div>
    );
  } else if (rank === 2) {
    return (
      <div className="flex items-center justify-center size-8 rounded-full bg-gray-400/20">
        <Medal className="size-4 text-gray-600" />
      </div>
    );
  } else if (rank === 3) {
    return (
      <div className="flex items-center justify-center size-8 rounded-full bg-orange-500/20">
        <Medal className="size-4 text-orange-600" />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center size-8 rounded-full bg-muted">
      <span className="text-sm font-medium text-muted-foreground">{rank}</span>
    </div>
  );
}

export function Leaderboard({ entries, loading = false, period = 'This Month' }: LeaderboardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="size-5 text-muted-foreground" />
            Top Performers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="size-5 text-muted-foreground" />
            Top Performers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Trophy className="size-12 text-muted-foreground/50 mb-4" />
            <p className="text-sm text-muted-foreground">No performance data yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Close deals to see the leaderboard
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="size-5 text-muted-foreground" />
            Top Performers
          </CardTitle>
          <span className="text-xs text-muted-foreground">{period}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {entries.map((entry) => (
          <div
            key={entry.userId}
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg transition-colors',
              'hover:bg-muted/50',
              entry.rank <= 3 && 'bg-muted/30'
            )}
          >
            {/* Rank Badge */}
            <div className="flex-shrink-0">
              {getRankBadge(entry.rank)}
            </div>

            {/* Avatar */}
            <Avatar className="size-10 flex-shrink-0">
              <AvatarImage src={entry.userAvatar} alt={entry.userName} />
              <AvatarFallback className="text-xs">
                {getInitials(entry.userName)}
              </AvatarFallback>
            </Avatar>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">
                {entry.userName}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{entry.dealsWon} deals</span>
                <span>•</span>
                <span className="font-medium text-foreground">
                  {formatCurrency(entry.dealValue)}
                </span>
              </div>
            </div>

            {/* Win Rate */}
            <div className="flex-shrink-0 text-right">
              <div className="text-sm font-medium text-green-600">
                {entry.winRate.toFixed(0)}%
              </div>
              <div className="text-xs text-muted-foreground">
                win rate
              </div>
            </div>
          </div>
        ))}

        {entries.length === 0 && (
          <div className="text-center py-8">
            <Trophy className="size-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No leaderboard data available
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
