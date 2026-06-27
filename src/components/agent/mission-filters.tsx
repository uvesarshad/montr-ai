'use client';

import { Chip } from '@/components/ui-kit';
import { cn } from '@/lib/utils';

type MissionFilterView = {
  id: 'active' | 'approval' | 'scheduled' | 'completed' | 'all';
  label: string;
};

interface MissionFiltersProps {
  views: MissionFilterView[];
  activeView: MissionFilterView['id'];
  counts: Record<MissionFilterView['id'], number>;
  onSelectView: (viewId: MissionFilterView['id']) => void;
}

export function MissionFilters({
  views,
  activeView,
  counts,
  onSelectView,
}: MissionFiltersProps) {
  return (
    <div className="grid gap-2">
      {views.map((view) => (
        <button
          key={view.id}
          type="button"
          onClick={() => onSelectView(view.id)}
          className={cn(
            'flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors',
            activeView === view.id
              ? 'border-brand/30 bg-accent text-foreground'
              : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <span className="text-sm font-medium">{view.label}</span>
          <Chip
            tone={activeView === view.id ? 'brand' : 'gray'}
            selected={activeView === view.id}
          >
            {String(counts[view.id]).padStart(2, '0')}
          </Chip>
        </button>
      ))}
    </div>
  );
}
