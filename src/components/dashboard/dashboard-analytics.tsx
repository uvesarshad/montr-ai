'use client';

/**
 * Dashboard analytics overview — flat KPI cards + real charts (recharts),
 * rendered above the existing dashboard content. Calm/mood-board styling:
 * #E3E1DF borders, no shadows, violet primary accent.
 */

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';

export interface DashboardKpi {
  label: string;
  value: string;
  sub?: string;
}

export interface DashboardAnalyticsProps {
  kpis: DashboardKpi[];
  platformData: { name: string; value: number }[];
  pipelineData: { name: string; value: number; color: string }[];
}

const tooltipStyle: React.CSSProperties = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
  color: 'hsl(var(--popover-foreground))',
  boxShadow: 'var(--app-shadow-strong)',
  padding: '6px 10px',
};

function ChartCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${className ?? ''}`}>
      <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{description}</p>
      <div className="mt-4 h-[200px]">{children}</div>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
      {label}
    </div>
  );
}

export function DashboardAnalytics({ kpis, platformData, pipelineData }: DashboardAnalyticsProps) {
  const hasPlatform = platformData.some((d) => d.value > 0);
  const pipelineTotal = pipelineData.reduce((sum, d) => sum + d.value, 0);

  return (
    <section className="flex flex-col gap-3">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-border bg-card p-4">
            <div className="text-[12px] font-medium text-muted-foreground">{kpi.label}</div>
            <div className="mt-2 text-[26px] font-bold leading-none tracking-tight tabular-nums text-foreground">
              {kpi.value}
            </div>
            {kpi.sub ? <div className="mt-1.5 text-[11px] text-muted-foreground">{kpi.sub}</div> : null}
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_1fr]">
        <ChartCard title="Engagement by platform" description="Avg interactions per platform · last 7 days">
          {hasPlatform ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platformData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip cursor={{ fill: 'hsl(var(--secondary))' }} contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="hsl(var(--primary))" maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="No platform data yet" />
          )}
        </ChartCard>

        <ChartCard title="Sales pipeline" description={`${pipelineTotal} deals by status`}>
          {pipelineTotal > 0 ? (
            <div className="flex h-full items-center gap-2">
              <ResponsiveContainer width="52%" height="100%">
                <PieChart>
                  <Pie
                    data={pipelineData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={42}
                    outerRadius={68}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {pipelineData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-1 flex-col gap-2">
                {pipelineData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-2 text-[12px]">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: entry.color }} />
                    <span className="flex-1 truncate text-muted-foreground">{entry.name}</span>
                    <span className="font-semibold tabular-nums text-foreground">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyChart label="No deals yet" />
          )}
        </ChartCard>
      </div>
    </section>
  );
}
