/**
 * Error Distribution Component
 *
 * Displays distribution of error types in failed executions
 */

'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { ErrorDistribution as ErrorDistributionType } from '@/hooks/use-analytics';

interface ErrorDistributionProps {
  errors: ErrorDistributionType[];
}

function ErrorCustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { type: string } }> }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border rounded-lg shadow-lg">
        <p className="font-semibold mb-1">{payload[0].payload.type}</p>
        <p className="text-sm text-red-600">
          Count: <span className="font-semibold">{payload[0].value}</span>
        </p>
      </div>
    );
  }
  return null;
}

export function ErrorDistribution({ errors }: ErrorDistributionProps) {
  const totalErrors = errors.reduce((sum, e) => sum + e.count, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Error Distribution</CardTitle>
            <CardDescription>Types of errors in failed executions</CardDescription>
          </div>
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="size-3" />
            {totalErrors} Errors
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {errors.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <AlertTriangle className="size-12 mx-auto mb-3 text-gray-300" />
            <p>No errors found</p>
            <p className="text-sm">All executions completed successfully!</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={errors} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" stroke="#888888" fontSize={12} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="type"
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  width={120}
                />
                <Tooltip content={<ErrorCustomTooltip />} />
                <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Error list */}
            <div className="mt-4 space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground">Top Errors:</h4>
              {errors.slice(0, 5).map((error, index) => {
                const percentage = ((error.count / totalErrors) * 100).toFixed(1);
                return (
                  <div key={error.type} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">#{index + 1}</span>
                      <span className="font-medium">{error.type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-red-600">{error.count}</span>
                      <Badge variant="outline">{percentage}%</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
