'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FunnelStage {
  stageId: string;
  stageName: string;
  dealCount: number;
  totalValue: number;
  conversionRate: number;
}

interface DealFunnelProps {
  pipelineName?: string;
  stages: FunnelStage[];
  loading?: boolean;
  onStageClick?: (stageId: string) => void;
}

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
}

export function DealFunnel({
  pipelineName = 'Sales Pipeline',
  stages,
  loading = false,
  onStageClick,
}: DealFunnelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="size-5 text-muted-foreground" />
            Deal Funnel
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="size-32" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (stages.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="size-5 text-muted-foreground" />
            Deal Funnel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground">No pipeline data available</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add deals to see your funnel
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxCount = Math.max(...stages.map(s => s.dealCount), 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="size-5 text-muted-foreground" />
          Deal Funnel - {pipelineName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stages.map((stage, index) => {
          const widthPercentage = (stage.dealCount / maxCount) * 100;
          const isClickable = onStageClick && stage.dealCount > 0;

          return (
            <div key={stage.stageId} className="space-y-1">
              <div
                className={cn(
                  'relative rounded-lg p-3 transition-colors',
                  'border border-primary/20 bg-primary/10',
                  isClickable && 'cursor-pointer hover:bg-primary/20'
                )}
                style={{ width: `${Math.max(widthPercentage, 20)}%` }}
                onClick={() => isClickable && onStageClick(stage.stageId)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {stage.stageName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({stage.dealCount})
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatCurrency(stage.totalValue)}
                    </div>
                  </div>
                </div>
              </div>

              {index < stages.length - 1 && (
                <div className="flex items-center gap-2 pl-4 py-1">
                  <ArrowDown className="size-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {stage.conversionRate > 0 ? (
                      <>
                        {stage.conversionRate.toFixed(0)}% conversion
                      </>
                    ) : (
                      'No conversion data'
                    )}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {stages.length > 0 && (
          <div className="pt-3 border-t border-muted mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Deals</span>
              <span className="font-medium">
                {stages.reduce((sum, s) => sum + s.dealCount, 0)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-muted-foreground">Total Value</span>
              <span className="font-medium">
                {formatCurrency(stages.reduce((sum, s) => sum + s.totalValue, 0))}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
