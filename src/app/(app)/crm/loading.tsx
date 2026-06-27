import { Skeleton } from '@/components/ui/skeleton';

export default function CrmLoading() {
  return (
    <div className="flex h-full w-full">
      <div className="hidden w-56 border-r p-3 lg:block">
        <Skeleton className="mb-4 h-5 w-24" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
      <div className="flex-1 space-y-4 p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
