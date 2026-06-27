'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface FilterConfig {
  key: string;
  label: string;
  component: React.ReactNode;
}

interface CrmFiltersProps {
  filters: FilterConfig[];
  onClearAll?: () => void;
  className?: string;
  show?: boolean;
}

export function CrmFilters({
  filters,
  onClearAll,
  className,
  show = true,
}: CrmFiltersProps) {
  if (!show) return null;

  return (
    <Card className={cn('', className)}>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Filters</h3>
            {onClearAll && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearAll}
                className="h-8 text-xs"
              >
                Clear all
              </Button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filters.map((filter) => (
              <div key={filter.key} className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  {filter.label}
                </label>
                {filter.component}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
