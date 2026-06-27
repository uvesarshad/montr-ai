'use client';

import { KpiTile } from '@/components/ui-kit';
import { Canvas } from '@/hooks/use-canvases-v2';
import { Activity, CheckCircle2, Workflow, Zap } from 'lucide-react';
import { useMemo } from 'react';

interface AutomationStatsProps {
  canvases: Canvas[] | null;
  isLoading: boolean;
}

const numberFormatter = new Intl.NumberFormat('en-US');

export function AutomationStats({ canvases, isLoading }: AutomationStatsProps) {
  const stats = useMemo(() => {
    if (!canvases) {
      return {
        total: 0,
        active: 0,
        executions: 0,
        mostActive: 'No activity yet',
      };
    }

    const total = canvases.length;
    const active = canvases.filter((canvas) => canvas.stats?.isActive).length;
    const executions = canvases.reduce(
      (acc, canvas) => acc + (canvas.stats?.executionCount || 0),
      0
    );

    const mostActiveCanvas = [...canvases].sort(
      (a, b) => (b.stats?.executionCount || 0) - (a.stats?.executionCount || 0)
    )[0];

    const mostActive =
      mostActiveCanvas?.stats?.executionCount && mostActiveCanvas.name
        ? mostActiveCanvas.name
        : 'No activity yet';

    return { total, active, executions, mostActive };
  }, [canvases]);

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <KpiTile
        icon={Workflow}
        label="Library"
        value={isLoading ? '…' : numberFormatter.format(stats.total)}
        delta={isLoading ? undefined : `${stats.active} active`}
        up={stats.active > 0}
        iconTone="info"
        pastel="blue"
      />
      <KpiTile
        icon={CheckCircle2}
        label="Active"
        value={isLoading ? '…' : numberFormatter.format(stats.active)}
        delta={isLoading ? undefined : `${Math.max(stats.total - stats.active, 0)} idle`}
        up={stats.active > 0}
        iconTone="ok"
        pastel="mint"
      />
      <KpiTile
        icon={Activity}
        label="Executions"
        value={isLoading ? '…' : numberFormatter.format(stats.executions)}
        delta={isLoading ? undefined : 'lifetime runs'}
        up={stats.executions > 0}
        iconTone="brand"
        pastel="violet"
      />
      <KpiTile
        icon={Zap}
        label="Top automation"
        value={isLoading ? '…' : stats.mostActive}
        iconTone="warn"
        pastel="peach"
      />
    </div>
  );
}
