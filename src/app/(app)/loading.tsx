import { Skeleton } from '@/components/ui/skeleton';

// Default fallback for any (app) route while it streams in. Individual sections
// (CRM, canvas, agent, dashboard) override this with section-specific skeletons.

export default function AppLoading() {
  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
