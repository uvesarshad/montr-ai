'use client';

/**
 * RecordCalendar — Twenty-style month calendar for CRM records.
 *
 * Generic month grid (weeks × 7) that renders arbitrary dated items as small
 * chips inside day cells (capped per day with a "+N more" Popover). The parent
 * owns data-fetching: it passes the visible month plus a flat list of
 * `CalendarItem`s and reacts to `onMonthChange` to re-fetch the new range.
 *
 * On mobile the grid collapses to a stacked agenda list (only days that have
 * items, in date order).
 *
 * Self-contained date math via date-fns — the synced-events calendar uses a
 * 7-day week view (`calendar-view.tsx`) which isn't a month grid, so there was
 * nothing clean to share.
 */

import * as React from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui-kit';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface CalendarItem {
  id: string;
  date: Date;
  label: string;
  /** Tailwind/token classes for the chip (bg/text/border). */
  color?: string;
  meta?: React.ReactNode;
}

export interface RecordCalendarProps {
  /** Any date within the month to display (first-of-month is derived). */
  month: Date;
  items: CalendarItem[];
  onMonthChange: (month: Date) => void;
  onItemClick?: (item: CalendarItem) => void;
  /** Max chips shown per day before collapsing into "+N more". */
  maxPerDay?: number;
  loading?: boolean;
  emptyLabel?: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT_CHIP =
  'bg-[var(--accent-100)] text-[var(--accent-700)] border-transparent';

function ItemChip({
  item,
  onClick,
}: {
  item: CalendarItem;
  onClick?: (item: CalendarItem) => void;
}) {
  return (
    <button
      type="button"
      title={item.label}
      onClick={onClick ? () => onClick(item) : undefined}
      className={cn(
        'block w-full truncate rounded-md border px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight transition-colors',
        item.color || DEFAULT_CHIP,
        onClick && 'cursor-pointer hover:brightness-95',
      )}
    >
      {item.label}
    </button>
  );
}

export function RecordCalendar({
  month,
  items,
  onMonthChange,
  onItemClick,
  maxPerDay = 3,
  loading = false,
  emptyLabel = 'No records this month',
}: RecordCalendarProps) {
  const monthStart = startOfMonth(month);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 0 });

  const days = React.useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart.getTime(), gridEnd.getTime()], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Group items by day key (yyyy-MM-dd).
  const itemsByDay = React.useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of items) {
      if (!it.date || isNaN(it.date.getTime())) continue;
      const key = format(it.date, 'yyyy-MM-dd');
      const arr = map.get(key);
      if (arr) arr.push(it);
      else map.set(key, [it]);
    }
    return map;
  }, [items]);

  const today = new Date();

  const header = (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-[15px] font-semibold tracking-[-0.01em]">
        {format(monthStart, 'MMMM yyyy')}
      </h3>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          icon={ChevronLeft}
          aria-label="Previous month"
          onClick={() => onMonthChange(addMonths(monthStart, -1))}
        />
        <Button variant="outline" size="sm" onClick={() => onMonthChange(today)}>
          Today
        </Button>
        <Button
          variant="outline"
          size="sm"
          icon={ChevronRight}
          aria-label="Next month"
          onClick={() => onMonthChange(addMonths(monthStart, 1))}
        />
      </div>
    </div>
  );

  function dayItems(day: Date): CalendarItem[] {
    return itemsByDay.get(format(day, 'yyyy-MM-dd')) ?? [];
  }

  // ---- Mobile agenda (only days with items) ----
  const agendaDays = days.filter(
    (d) => isSameMonth(d, monthStart) && dayItems(d).length > 0,
  );

  return (
    <div className={cn('flex flex-col', loading && 'opacity-60')}>
      {header}

      {/* Desktop month grid */}
      <div className="hidden sm:block">
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const inMonth = isSameMonth(day, monthStart);
            const isToday = isSameDay(day, today);
            const dayList = dayItems(day);
            const visible = dayList.slice(0, maxPerDay);
            const overflow = dayList.length - visible.length;
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'min-h-[104px] border-b border-r border-border p-1.5 [&:nth-child(7n)]:border-r-0',
                  !inMonth && 'bg-muted/30',
                )}
              >
                <div className="mb-1 flex items-center justify-end">
                  <span
                    className={cn(
                      'grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-medium tabular-nums',
                      isToday && 'bg-primary text-primary-foreground',
                      !isToday && !inMonth && 'text-muted-foreground/60',
                      !isToday && inMonth && 'text-foreground',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                </div>
                <div className="space-y-1">
                  {visible.map((it) => (
                    <ItemChip key={it.id} item={it} onClick={onItemClick} />
                  ))}
                  {overflow > 0 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="w-full rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted"
                        >
                          +{overflow} more
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-56 space-y-1 p-2">
                        <div className="mb-1 text-[11px] font-semibold text-muted-foreground">
                          {format(day, 'EEEE, MMM d')}
                        </div>
                        {dayList.map((it) => (
                          <ItemChip key={it.id} item={it} onClick={onItemClick} />
                        ))}
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile agenda */}
      <div className="space-y-3 sm:hidden">
        {agendaDays.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          agendaDays.map((day) => (
            <div key={day.toISOString()}>
              <div
                className={cn(
                  'mb-1.5 text-[12px] font-semibold',
                  isSameDay(day, today) && 'text-primary',
                )}
              >
                {format(day, 'EEE, MMM d')}
              </div>
              <div className="space-y-1">
                {dayItems(day).map((it) => (
                  <ItemChip key={it.id} item={it} onClick={onItemClick} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
