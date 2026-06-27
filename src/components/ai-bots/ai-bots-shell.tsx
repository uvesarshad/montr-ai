'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, Mic, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import styles from './ai-bots.module.css';

type AIBotsShellStat = {
  label: string;
  value: string;
  tone?: 'blue' | 'emerald' | 'amber' | 'violet';
};

interface AIBotsShellProps {
  eyebrow?: string;
  title: string;
  description: string;
  badge?: string;
  stats?: AIBotsShellStat[];
  children: React.ReactNode;
}

const navItems: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
}> = [
  { href: '/ai-bots', label: 'Website bots', icon: Bot },
  { href: '/ai-bots/audio', label: 'Voice bots', icon: Mic },
];

const toneClasses: Record<NonNullable<AIBotsShellStat['tone']>, string> = {
  blue: 'text-[#0ea5e9]',
  emerald: 'text-[#10b981]',
  amber: 'text-[#f59e0b]',
  violet: 'text-brand',
};

function isNavActive(pathname: string, href: string) {
  if (href === '/ai-bots') {
    return pathname === '/ai-bots' || pathname === '/ai-bots/new' || /^\/ai-bots\/[^/]+$/.test(pathname);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AIBotsShell({
  eyebrow = 'AI Bots',
  title,
  description: _description,
  badge = 'Live',
  stats = [],
  children,
}: AIBotsShellProps) {
  const pathname = usePathname();
  const isPlanned = badge === 'Planned' || badge === 'In build';

  return (
    <div className={styles.shell}>
      {/* Compact status bar */}
      <section className={cn('app-glass', styles.statusBar)}>
        <div className={styles.statusHeader}>
          {isPlanned ? (
            <span className={styles.soonPill}>
              <span className={styles.pillText}>{badge}</span>
            </span>
          ) : (
            <span className={styles.livePill}>
              <span className={styles.liveDot} />
              <span className={styles.pillText}>{badge}</span>
            </span>
          )}
          <span className={styles.sectionName}>{title}</span>
          <span className={styles.sectionSub}>— {eyebrow}</span>
        </div>
        {stats.length > 0 && (
          <div className={styles.statusStats}>
            {stats.map((stat) => (
              <div key={stat.label} className={styles.statusStatCell}>
                <div
                  className={`${styles.statusStatValue} ${toneClasses[stat.tone ?? 'blue']}`}
                >
                  {stat.value}
                </div>
                <div className={styles.statusStatLabel}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Compact nav tabs */}
      <div className={styles.navTabsRow}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(styles.navTab, active && styles.navTabActive)}
            >
              <Icon className="size-3" />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
