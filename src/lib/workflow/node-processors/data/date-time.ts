/**
 * Date/Time Processor (`date_time` / `data_date_time`)
 *
 * Pure date math + formatting via date-fns. Dropdown-driven, no code.
 *
 * Config:
 *   - op:      'now' | 'add' | 'subtract' | 'format' | 'diff' | 'parse'
 *   - input:   base date (ISO string / epoch ms / `{{}}` ref). Defaults to now
 *              for add/subtract/format when omitted.
 *   - amount:  number for add/subtract/diff (diff uses input vs input2).
 *   - unit:    'minutes' | 'hours' | 'days' | 'weeks' | 'months' (add/subtract/diff).
 *   - format:  date-fns format string for `format` (default ISO).
 *   - input2:  second date for `diff`.
 *
 * Output: `{ success, result }`. For most ops `result` is an ISO string; for
 * `format` it's the formatted string; for `diff` it's a number (in `unit`).
 */

import {
  addMinutes, addHours, addDays, addWeeks, addMonths,
  subMinutes, subHours, subDays, subWeeks, subMonths,
  differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks, differenceInMonths,
  format as formatDate,
} from 'date-fns';
import { NodeProcessor, NodeProcessorContext } from '../index';

type DateOp = 'now' | 'add' | 'subtract' | 'format' | 'diff' | 'parse';
type DateUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';

const VALID_OPS: DateOp[] = ['now', 'add', 'subtract', 'format', 'diff', 'parse'];

function parseDate(value: unknown): Date {
  if (value == null || value === '') return new Date();
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const s = String(value).trim();
  // Numeric string → epoch ms.
  if (/^\d+$/.test(s)) return new Date(Number(s));
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error(`Could not parse date: "${s}"`);
  return d;
}

const ADDERS: Record<DateUnit, (d: Date, n: number) => Date> = {
  minutes: addMinutes, hours: addHours, days: addDays, weeks: addWeeks, months: addMonths,
};
const SUBBERS: Record<DateUnit, (d: Date, n: number) => Date> = {
  minutes: subMinutes, hours: subHours, days: subDays, weeks: subWeeks, months: subMonths,
};
const DIFFERS: Record<DateUnit, (a: Date, b: Date) => number> = {
  minutes: differenceInMinutes, hours: differenceInHours, days: differenceInDays,
  weeks: differenceInWeeks, months: differenceInMonths,
};

export class DateTimeProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const op = (VALID_OPS.includes(String(config.op) as DateOp) ? String(config.op) : 'now') as DateOp;
    const unit = (['minutes', 'hours', 'days', 'weeks', 'months'].includes(String(config.unit))
      ? String(config.unit)
      : 'days') as DateUnit;
    const amount = Number(config.amount);
    const amt = Number.isFinite(amount) ? amount : 0;

    let result: unknown;

    switch (op) {
      case 'now':
        result = new Date().toISOString();
        break;
      case 'add':
        result = ADDERS[unit](parseDate(config.input), amt).toISOString();
        break;
      case 'subtract':
        result = SUBBERS[unit](parseDate(config.input), amt).toISOString();
        break;
      case 'parse':
        result = parseDate(config.input).toISOString();
        break;
      case 'format': {
        const fmt = String(config.format || '').trim();
        const d = parseDate(config.input);
        result = fmt ? formatDate(d, fmt) : d.toISOString();
        break;
      }
      case 'diff': {
        const a = parseDate(config.input);
        const b = parseDate(config.input2);
        // input - input2 in the chosen unit.
        result = DIFFERS[unit](a, b);
        break;
      }
      default:
        result = new Date().toISOString();
    }

    return { success: true, result };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (config.op && !VALID_OPS.includes(String(config.op) as DateOp)) {
      errors.push(`op must be one of: ${VALID_OPS.join(', ')}`);
    }
    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}
