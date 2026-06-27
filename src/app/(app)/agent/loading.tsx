import { Skeleton } from '@/components/ui-kit';

export default function AgentLoading() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full">
      <div className="hidden w-64 border-r p-3 lg:block">
        <Skeleton className="mb-3 h-9 w-full" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex-1 space-y-3 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-3/4" />
          ))}
        </div>
        <div className="border-t p-4">
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
}
