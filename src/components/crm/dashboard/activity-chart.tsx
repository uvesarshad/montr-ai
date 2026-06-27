'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3 } from 'lucide-react';

interface ActivityData {
  date: string;
  count: number;
  completed: number;
}

interface ActivityChartProps {
  data: ActivityData[];
  loading?: boolean;
}

export function ActivityChart({ data, loading = false }: ActivityChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="size-5 text-muted-foreground" />
            Activity Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-end gap-2 h-20">
                <Skeleton className="flex-1 h-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="size-5 text-muted-foreground" />
            Activity Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground">No activity data available</p>
            <p className="text-xs text-muted-foreground mt-1">
              Start adding activities to see metrics
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Get last 14 days of data
  const last14Days = data.slice(-14);
  const maxCount = Math.max(...last14Days.map(d => d.count), 1);

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="size-5 text-muted-foreground" />
          Activity Metrics (Last 14 Days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Legend */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="size-3 rounded bg-blue-500" />
              <span className="text-muted-foreground">Total Activities</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="size-3 rounded bg-green-500" />
              <span className="text-muted-foreground">Completed</span>
            </div>
          </div>

          {/* Chart */}
          <div className="flex items-end gap-1 h-40">
            {last14Days.map((item, index) => {
              const totalHeight = (item.count / maxCount) * 100;
              const completedHeight = item.count > 0
                ? (item.completed / item.count) * totalHeight
                : 0;

              return (
                <div
                  key={index}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <div className="w-full flex flex-col-reverse items-center gap-0.5 flex-1">
                    <div
                      className="w-full rounded-t bg-blue-500/20 border-t-2 border-blue-500 relative group"
                      style={{ height: `${totalHeight}%` }}
                    >
                      <div
                        className="absolute bottom-0 left-0 right-0 rounded-t bg-green-500 transition-all"
                        style={{ height: `${completedHeight}%` }}
                      />

                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                        <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-2 text-xs whitespace-nowrap">
                          <div className="font-medium">{formatDate(item.date)}</div>
                          <div className="text-muted-foreground">
                            Total: {item.count}
                          </div>
                          <div className="text-muted-foreground">
                            Completed: {item.completed}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Date label - show every other date to avoid crowding */}
                  {index % 2 === 0 && (
                    <div className="text-xs text-muted-foreground">
                      {formatDate(item.date)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-muted">
            <div>
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="text-lg font-bold">
                {last14Days.reduce((sum, d) => sum + d.count, 0)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Completed</div>
              <div className="text-lg font-bold text-green-600">
                {last14Days.reduce((sum, d) => sum + d.completed, 0)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Completion Rate</div>
              <div className="text-lg font-bold">
                {(() => {
                  const total = last14Days.reduce((sum, d) => sum + d.count, 0);
                  const completed = last14Days.reduce((sum, d) => sum + d.completed, 0);
                  return total > 0 ? `${((completed / total) * 100).toFixed(0)}%` : '0%';
                })()}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
