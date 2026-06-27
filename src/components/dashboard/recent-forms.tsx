'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { FileText, Plus } from 'lucide-react';
import {
  DashboardEmptyState,
  DashboardFooterLink,
  DashboardPanel,
  DashboardPanelHeader,
} from '@/components/dashboard/dashboard-primitives';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useForms } from '@/hooks/use-forms';

export function RecentForms() {
  const { forms, isLoading } = useForms();

  const recentForms = forms
    ? [...forms]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5)
    : [];

  return (
    <DashboardPanel>
      <DashboardPanelHeader
        eyebrow="Forms"
        title="Recent Forms"
        actions={
          <Link href="/forms/new">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-[0.4rem] border-border/60 bg-background/70 px-3 text-xs"
            >
              <Plus className="size-3.5" />
              New
            </Button>
          </Link>
        }
      />

      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-3 px-5 py-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4">
                <Skeleton className="size-10 rounded-[12px]" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : recentForms.length > 0 ? (
          <div className="divide-y divide-border/60">
            {recentForms.map((form) => (
              <Link
                key={form._id}
                href={`/forms/${form._id}`}
                className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-background/60"
              >
                <div className="flex size-10 items-center justify-center rounded-[12px] bg-orange-500/10 text-orange-500">
                  <FileText className="size-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-semibold text-foreground">{form.title}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {form.updatedAt
                        ? formatDistanceToNow(new Date(form.updatedAt), { addSuffix: true })
                        : 'Recently updated'}
                    </span>
                    {(form as { submissionsCount?: number }).submissionsCount !== undefined ? (
                      <>
                        <span className="hidden size-1 rounded-full bg-border sm:block" />
                        <span>{(form as { submissionsCount?: number }).submissionsCount} responses</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <DashboardEmptyState
            icon={FileText}
            title="No forms created"
            description="Create the first form to start capturing responses and qualification data."
            actionHref="/forms/new"
            actionLabel="Create Form"
          />
        )}
      </CardContent>

      <DashboardFooterLink href="/forms" label="View All Forms" />
    </DashboardPanel>
  );
}
