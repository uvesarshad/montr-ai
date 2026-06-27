'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { TrendingUp, BarChart3, Activity } from 'lucide-react';

import { Card, Skeleton, EmptyState, Select } from '@/components/ui-kit';

interface AnalyticsChartsProps {
  accountId?: string;
}

interface ChartData {
  date: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

interface CampaignPerformance {
  name: string;
  sent: number;
  delivered: number;
  read: number;
  deliveryRate: number;
  readRate: number;
}

function CampaignPerformanceCard({ campaignData }: { campaignData: CampaignPerformance[] }) {
  return (
    <Card icon={BarChart3} title="Campaign performance comparison" meta="delivery vs read">
      <div className="px-4 pb-4">
        {campaignData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              data={campaignData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
              />
              <Legend />
              <Bar dataKey="deliveryRate" fill="hsl(var(--success))" name="Delivery Rate %" />
              <Bar dataKey="readRate" fill="hsl(var(--brand))" name="Read Rate %" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={BarChart3}
            title="No campaign data available"
            note="Start sending campaigns to see performance metrics."
          />
        )}
      </div>
    </Card>
  );
}

function EngagementFunnelCard({ timeSeriesData }: { timeSeriesData: ChartData[] }) {
  return (
    <Card title="Message engagement funnel" meta="sent to read journey">
      <div className="px-4 pb-4">
        {timeSeriesData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart
              data={timeSeriesData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="sent"
                stackId="1"
                stroke="hsl(var(--info))"
                fill="hsl(var(--info))"
                fillOpacity={0.6}
                name="Sent"
              />
              <Area
                type="monotone"
                dataKey="delivered"
                stackId="2"
                stroke="hsl(var(--success))"
                fill="hsl(var(--success))"
                fillOpacity={0.6}
                name="Delivered"
              />
              <Area
                type="monotone"
                dataKey="read"
                stackId="3"
                stroke="hsl(var(--brand))"
                fill="hsl(var(--brand))"
                fillOpacity={0.6}
                name="Read"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState icon={Activity} title="No engagement data available" />
        )}
      </div>
    </Card>
  );
}

export function AnalyticsCharts({ accountId }: AnalyticsChartsProps) {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d');
  const [chartType, setChartType] = useState<'line' | 'bar' | 'area'>('line');
  const [timeSeriesData, setTimeSeriesData] = useState<ChartData[]>([]);
  const [campaignData, setCampaignData] = useState<CampaignPerformance[]>([]);

  // Fetch chart data
  const fetchChartData = useCallback(async () => {
    setLoading(true);
    try {
      const url = accountId
        ? `/api/whatsapp/analytics/charts?accountId=${accountId}&range=${timeRange}`
        : `/api/whatsapp/analytics/charts?range=${timeRange}`;

      const response = await fetch(url);
      const data = await response.json();

      if (response.ok) {
        setTimeSeriesData(data.data.timeSeries || []);
        setCampaignData(data.data.campaigns || []);
      }
    } catch (error) {
      console.error('Error fetching chart data:', error);
    } finally {
      setLoading(false);
    }
  }, [accountId, timeRange]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-80 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const renderChart = () => {
    const commonProps = {
      data: timeSeriesData,
      margin: { top: 5, right: 30, left: 20, bottom: 5 },
    };

    switch (chartType) {
      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
            />
            <Legend />
            <Bar dataKey="sent" fill="hsl(var(--info))" name="Sent" />
            <Bar dataKey="delivered" fill="hsl(var(--success))" name="Delivered" />
            <Bar dataKey="read" fill="hsl(var(--brand))" name="Read" />
            <Bar dataKey="failed" fill="hsl(var(--destructive))" name="Failed" />
          </BarChart>
        );

      case 'area':
        return (
          <AreaChart {...commonProps}>
            <defs>
              <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--info))" stopOpacity={0.8} />
                <stop offset="95%" stopColor="hsl(var(--info))" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="colorDelivered" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.8} />
                <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="colorRead" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--brand))" stopOpacity={0.8} />
                <stop offset="95%" stopColor="hsl(var(--brand))" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="sent"
              stroke="hsl(var(--info))"
              fillOpacity={1}
              fill="url(#colorSent)"
              name="Sent"
            />
            <Area
              type="monotone"
              dataKey="delivered"
              stroke="hsl(var(--success))"
              fillOpacity={1}
              fill="url(#colorDelivered)"
              name="Delivered"
            />
            <Area
              type="monotone"
              dataKey="read"
              stroke="hsl(var(--brand))"
              fillOpacity={1}
              fill="url(#colorRead)"
              name="Read"
            />
          </AreaChart>
        );

      default: // line
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="sent"
              stroke="hsl(var(--info))"
              strokeWidth={2}
              name="Sent"
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="delivered"
              stroke="hsl(var(--success))"
              strokeWidth={2}
              name="Delivered"
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="read"
              stroke="hsl(var(--brand))"
              strokeWidth={2}
              name="Read"
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="failed"
              stroke="hsl(var(--destructive))"
              strokeWidth={2}
              name="Failed"
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Message Trends Over Time */}
      <Card
        icon={TrendingUp}
        title="Message trends over time"
        meta="delivery & engagement"
        action={
          <div className="flex gap-2">
            <Select
              value={chartType}
              onChange={(value) => setChartType(value as 'line' | 'bar' | 'area')}
              triggerClassName="w-[130px]"
              options={[
                { value: 'line', label: 'Line Chart' },
                { value: 'bar', label: 'Bar Chart' },
                { value: 'area', label: 'Area Chart' },
              ]}
            />
            <Select
              value={timeRange}
              onChange={setTimeRange}
              triggerClassName="w-[130px]"
              options={[
                { value: '7d', label: 'Last 7 days' },
                { value: '30d', label: 'Last 30 days' },
                { value: '90d', label: 'Last 90 days' },
              ]}
            />
          </div>
        }
      >
        <div className="px-4 pb-4">
          {timeSeriesData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              {renderChart()}
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={Activity} title="No data available" note="No messages for the selected period." />
          )}
        </div>
      </Card>

      {/* Campaign Performance Comparison */}
      <CampaignPerformanceCard campaignData={campaignData} />

      {/* Engagement Funnel */}
      <EngagementFunnelCard timeSeriesData={timeSeriesData} />
    </div>
  );
}
