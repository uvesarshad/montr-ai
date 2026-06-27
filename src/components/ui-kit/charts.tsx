'use client';

/**
 * ui-kit · charts — lightweight dependency-free SVG charts.
 *
 * Ported from the v0.6 design mockup (removed) dashboard.jsx. Colors accept any
 * CSS color; defaults use theme tokens (hsl(var(--brand)) etc.). For richer
 * charts the app also has recharts — these are for compact dashboard visuals.
 */

import * as React from 'react';

import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ Spark */

export interface SparkProps {
  data: number[];
  color?: string;
  /** viewBox width (scales to container). */
  w?: number;
  h?: number;
  fill?: boolean;
  className?: string;
}

export function Spark({ data, color = 'hsl(var(--brand))', w = 128, h = 34, fill = true, className }: SparkProps) {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const rng = max - min || 1;
  const xs = (i: number) => (i / Math.max(1, data.length - 1)) * w;
  const ys = (v: number) => h - 2 - ((v - min) / rng) * (h - 7);
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)} ${ys(v).toFixed(1)}`).join('');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn('block', className)}>
      {fill ? <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={color} opacity="0.1" /> : null}
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* -------------------------------------------------------------- AreaChart */

export interface ChartSeries {
  name: string;
  color: string;
  data: number[];
}

export interface AreaChartProps {
  series: ChartSeries[];
  labels?: { x: number; t: string }[];
  className?: string;
}

export function AreaChart({ series, labels = [], className }: AreaChartProps) {
  const W = 640;
  const H = 180;
  const pl = 6;
  const pr = 6;
  const pt = 14;
  const pb = 22;
  if (!series.length || !series[0].data.length) return null;
  const n = series[0].data.length;
  const max = Math.max(...series.flatMap((s) => s.data)) * 1.12 || 1;
  const xs = (i: number) => pl + (i / Math.max(1, n - 1)) * (W - pl - pr);
  const ys = (v: number) => pt + (1 - v / max) * (H - pt - pb);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => pt + f * (H - pt - pb));
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn('block', className)}>
      {grid.map((y, i) => (
        <line key={i} x1={pl} x2={W - pr} y1={y} y2={y} stroke="hsl(var(--border))" strokeWidth="1" />
      ))}
      {series.map((s, si) => {
        const line = s.data.map((v, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)} ${ys(v).toFixed(1)}`).join('');
        return (
          <g key={si}>
            <path d={`${line} L${xs(n - 1)} ${H - pb} L${xs(0)} ${H - pb} Z`} fill={s.color} opacity="0.09" />
            <path d={line} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        );
      })}
      {labels.map((l, i) => (
        <text
          key={i}
          x={l.x * (W - pl - pr) + pl}
          y={H - 6}
          fontSize="9.5"
          fill="hsl(var(--muted-foreground))"
          textAnchor="middle"
          className="font-mono"
        >
          {l.t}
        </text>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ Donut */

export interface DonutSegment {
  value: number;
  color: string;
  label?: string;
}

export interface DonutProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  className?: string;
}

export function Donut({ segments, size = 148, thickness = 20, className }: DonutProps) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${len.toFixed(2)} ${(c - len).toFixed(2)}`}
              strokeDashoffset={(-off).toFixed(2)}
            />
          );
          off += len;
          return el;
        })}
      </g>
    </svg>
  );
}
