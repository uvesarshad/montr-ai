'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Trash2, Copy, Settings2, Power, Plus, Clipboard,
  Maximize2, MousePointer2, Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type RadialMenuVariant = 'pane' | 'node' | 'edge';

interface RadialAction {
  icon: React.ReactNode;
  label: string;
  action: string;
  angle: number;  // 0 = top, 90 = right, 180 = bottom, 270 = left (clockwise)
  danger?: boolean;
}

export interface RadialMenuProps {
  x: number;
  y: number;
  variant: RadialMenuVariant;
  onClose: () => void;
  onAction: (action: string) => void;
}

// ── Layout ──────────────────────────────────────────────────────────────────
const ORBIT_R  = 64;                        // center → button center (px)
const BTN_D    = 42;                        // orbit button diameter (px)
const CTR_D    = 50;                        // center button diameter (px)
const LABEL_R  = ORBIT_R + BTN_D / 2 + 12; // label anchor from center
const MARGIN   = LABEL_R + 28;              // viewport clamping margin

function polar(angleDeg: number, r: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
}

function labelTransform(lx: number, ly: number): string {
  if (Math.abs(lx) < 8) return ly < 0 ? 'translate(-50%, -100%)' : 'translate(-50%, 0%)';
  return lx > 0 ? 'translate(0%, -50%)' : 'translate(-100%, -50%)';
}

// ── Action definitions ───────────────────────────────────────────────────────
const PANE_ACTIONS: RadialAction[] = [
  { icon: <Plus className="h-[18px] w-[18px]" />,          label: 'Add Node',   action: 'add-node',   angle: 0   },
  { icon: <MousePointer2 className="h-[17px] w-[17px]" />, label: 'Select All', action: 'select-all', angle: 90  },
  { icon: <Maximize2 className="h-[17px] w-[17px]" />,     label: 'Fit View',   action: 'fit-view',   angle: 180 },
  { icon: <Clipboard className="h-[17px] w-[17px]" />,     label: 'Paste',      action: 'paste',      angle: 270 },
];

const NODE_ACTIONS: RadialAction[] = [
  { icon: <Trash2 className="h-[17px] w-[17px]" />, label: 'Delete',    action: 'delete',    angle: 0,   danger: true },
  { icon: <Copy className="h-[17px] w-[17px]" />,   label: 'Duplicate', action: 'duplicate', angle: 90  },
  { icon: <Power className="h-[17px] w-[17px]" />,  label: 'Disable',   action: 'disable',   angle: 180 },
  { icon: <Play className="h-[17px] w-[17px]" />,   label: 'Run',       action: 'run',       angle: 270 },
];

const EDGE_ACTIONS: RadialAction[] = [
  { icon: <Trash2 className="h-[18px] w-[18px]" />, label: 'Delete Edge', action: 'delete', angle: 0, danger: true },
];

const CENTER: Record<RadialMenuVariant, { icon: React.ReactNode; action: string; primary?: boolean; danger?: boolean }> = {
  pane: { icon: <Plus className="h-[20px] w-[20px]" />,      action: 'add-node', primary: true },
  node: { icon: <Settings2 className="h-[19px] w-[19px]" />, action: 'settings' },
  edge: { icon: <Trash2 className="h-[19px] w-[19px]" />,    action: 'delete',   danger: true  },
};

const VARIANT_ACTIONS: Record<RadialMenuVariant, RadialAction[]> = {
  pane: PANE_ACTIONS,
  node: NODE_ACTIONS,
  edge: EDGE_ACTIONS,
};

// ── Component ────────────────────────────────────────────────────────────────
export function RadialMenu({ x, y, variant, onClose, onAction }: RadialMenuProps) {
  const [visible, setVisible] = useState(false);
  const actions = VARIANT_ACTIONS[variant];
  const center = CENTER[variant];

  const vw = typeof window !== 'undefined' ? window.innerWidth  : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const cx = Math.min(Math.max(x, MARGIN), vw - MARGIN);
  const cy = Math.min(Math.max(y, MARGIN), vh - MARGIN);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleAction = useCallback((action: string) => {
    onAction(action);
    onClose();
  }, [onAction, onClose]);

  return (
    <>
      {/* Full-screen click-outside trap */}
      <div
        className="fixed inset-0 z-[100]"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />

      {/* Menu anchor — positioned at click point */}
      <div
        className="fixed z-[101] pointer-events-none select-none"
        style={{ left: cx, top: cy }}
      >
        {/* Orbit buttons + labels */}
        {actions.map((act, i) => {
          const btn = polar(act.angle, ORBIT_R);
          const lbl = polar(act.angle, LABEL_R);
          const delay = 20 + i * 22;

          return (
            <React.Fragment key={act.action}>
              <button
                type="button"
                className={cn(
                  'absolute pointer-events-auto flex items-center justify-center rounded-full',
                  'backdrop-blur-2xl border shadow-lg',
                  'transition-[background-color,box-shadow] duration-100 active:scale-[0.88]',
                  act.danger
                    ? 'bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-400/25'
                    : 'bg-background/85 hover:bg-muted text-foreground/70 hover:text-foreground border-border/35',
                )}
                style={{
                  width:  BTN_D,
                  height: BTN_D,
                  left:   btn.x - BTN_D / 2,
                  top:    btn.y - BTN_D / 2,
                  transform: visible
                    ? 'scale(1) translate(0px, 0px)'
                    : `scale(0.3) translate(${-btn.x * 0.7}px, ${-btn.y * 0.7}px)`,
                  opacity: visible ? 1 : 0,
                  transition: [
                    `transform 210ms cubic-bezier(0.34,1.56,0.64,1) ${delay}ms`,
                    `opacity   160ms ease-out ${delay}ms`,
                    'background-color 100ms ease',
                  ].join(', '),
                }}
                onClick={(e) => { e.stopPropagation(); handleAction(act.action); }}
              >
                {act.icon}
              </button>

              <span
                className="absolute pointer-events-none text-[10px] leading-none font-medium text-muted-foreground/75 whitespace-nowrap"
                style={{
                  left:      lbl.x,
                  top:       lbl.y,
                  transform: labelTransform(lbl.x, lbl.y),
                  opacity:   visible ? 1 : 0,
                  transition: `opacity 150ms ease-out ${delay + 50}ms`,
                }}
              >
                {act.label}
              </span>
            </React.Fragment>
          );
        })}

        {/* Center button */}
        <button
          type="button"
          className={cn(
            'absolute pointer-events-auto flex items-center justify-center rounded-full',
            'backdrop-blur-2xl border shadow-xl',
            'transition-[background-color,box-shadow] duration-100 active:scale-[0.88]',
            center.danger
              ? 'bg-red-500/12 hover:bg-red-500/22 text-red-500 border-red-400/30'
              : center.primary
              ? 'bg-primary/10 hover:bg-primary/18 text-primary border-primary/28'
              : 'bg-background/92 hover:bg-muted text-foreground/85 hover:text-foreground border-border/45',
          )}
          style={{
            width:  CTR_D,
            height: CTR_D,
            left:  -CTR_D / 2,
            top:   -CTR_D / 2,
            transform: `scale(${visible ? 1 : 0})`,
            opacity:   visible ? 1 : 0,
            transition: [
              'transform 250ms cubic-bezier(0.34,1.56,0.64,1) 0ms',
              'opacity   190ms ease-out 0ms',
              'background-color 100ms ease',
            ].join(', '),
          }}
          onClick={(e) => { e.stopPropagation(); handleAction(center.action); }}
        >
          {center.icon}
        </button>
      </div>
    </>
  );
}
