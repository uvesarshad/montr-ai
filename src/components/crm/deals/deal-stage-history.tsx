'use client';

import { Deal, Pipeline } from '@/types/crm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDistanceToNow, differenceInDays, format } from 'date-fns';
import { Clock, CheckCircle2 } from 'lucide-react';

interface DealStageHistoryProps {
  deal: Deal;
  pipeline: Pipeline;
}

export function DealStageHistory({ deal, pipeline }: DealStageHistoryProps) {
  const sortedHistory = [...deal.stageHistory].sort(
    (a, b) => new Date(a.enteredAt).getTime() - new Date(b.enteredAt).getTime()
  );

  const getStageColor = (stageId: string) => {
    const stage = pipeline.stages.find((s) => s._id === stageId);
    return stage?.color || '#6366f1';
  };

  const calculateDuration = (enteredAt: Date, exitedAt?: Date) => {
    const start = new Date(enteredAt);
    const end = exitedAt ? new Date(exitedAt) : new Date();
    const days = differenceInDays(end, start);

    if (days === 0) return 'Less than a day';
    if (days === 1) return '1 day';
    return `${days} days`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Stage History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sortedHistory.map((history, index) => {
            const isCurrentStage = !history.exitedAt;
            const duration = calculateDuration(history.enteredAt, history.exitedAt);

            return (
              <div key={`${history.stageId}-${history.enteredAt}`} className="relative">
                {/* Connection line */}
                {index < sortedHistory.length - 1 && (
                  <div className="absolute left-2 top-8 bottom-0 w-0.5 bg-border" />
                )}

                <div className="flex items-start gap-3">
                  {/* Stage indicator */}
                  <div
                    className="size-4 rounded-full border-2 border-background mt-1 flex-shrink-0"
                    style={{ backgroundColor: getStageColor(history.stageId) }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{history.stageName}</span>
                        {isCurrentStage && (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="size-3" />
                            Current
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" />
                        {duration}
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground mt-1">
                      {format(new Date(history.enteredAt), 'MMM d, yyyy h:mm a')}
                      {history.exitedAt && (
                        <>
                          {' → '}
                          {format(new Date(history.exitedAt), 'MMM d, yyyy h:mm a')}
                        </>
                      )}
                      {isCurrentStage && (
                        <> • {formatDistanceToNow(new Date(history.enteredAt), { addSuffix: true })}</>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {sortedHistory.length === 0 && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No stage history available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
