/**
 * Execution Trend Chart Component
 *
 * Displays execution trend over time with success/failure breakdown
 */

'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { ExecutionTrendPoint } from '@/hooks/use-analytics';

interface ExecutionTrendChartProps {
  data: ExecutionTrendPoint[];
  type?: 'line' | 'area';
}

function TrendCustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border rounded-lg shadow-lg">
        <p className="font-semibold mb-1">{label}</p>
        <div className="space-y-1">
          <p className="text-sm text-blue-600">
            Total: <span className="font-semibold">{payload[0]?.value}</span>
          </p>
          <p className="text-sm text-green-600">
            Success: <span className="font-semibold">{payload[1]?.value}</span>
          </p>
          <p className="text-sm text-red-600">
            Failed: <span className="font-semibold">{payload[2]?.value}</span>
          </p>
        </div>
      </div>
    );
  }
  return null;
}

export function ExecutionTrendChart({ data, type = 'area' }: ExecutionTrendChartProps) {
  // Format dates for display
  const formattedData = data.map((point) => ({
    ...point,
    date: format(new Date(point.date), 'MMM d'),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Execution Trend</CardTitle>
        <CardDescription>Workflow executions over time</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          {type === 'area' ? (
            <AreaChart data={formattedData}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}`}
              />
              <Tooltip content={<TrendCustomTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="total"
                name="Total"
                stroke="#3b82f6"
                fill="url(#colorTotal)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="success"
                name="Success"
                stroke="#10b981"
                fill="url(#colorSuccess)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="failed"
                name="Failed"
                stroke="#ef4444"
                fill="url(#colorFailed)"
                strokeWidth={2}
              />
            </AreaChart>
          ) : (
            <LineChart data={formattedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}`}
              />
              <Tooltip content={<TrendCustomTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="total"
                name="Total"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="success"
                name="Success"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="failed"
                name="Failed"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
