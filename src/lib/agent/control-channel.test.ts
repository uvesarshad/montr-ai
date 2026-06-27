
import { it, expect } from 'vitest';
import { parseControlCommand, normalizePhone } from './control-channel';

// ─── parseControlCommand ──────────────────────────────────────────────────────

it('parseControlCommand: PAIR with 6-digit code', () => {
    expect(parseControlCommand('PAIR 123456')).toEqual({ kind: 'pair', code: '123456' });
    expect(parseControlCommand('  pair 000111  ')).toEqual({ kind: 'pair', code: '000111' });
});

it('parseControlCommand: PAIR with wrong code shape falls through to help', () => {
    expect(parseControlCommand('PAIR 12345').kind).toBe('help');
    expect(parseControlCommand('PAIR abcdef').kind).toBe('help');
    expect(parseControlCommand('PAIR').kind).toBe('help');
});

it('parseControlCommand: status and shorthand', () => {
    expect(parseControlCommand('status')).toEqual({ kind: 'status' });
    expect(parseControlCommand('ST')).toEqual({ kind: 'status' });
});

it('parseControlCommand: approve / reject with index', () => {
    expect(parseControlCommand('approve 2')).toEqual({ kind: 'approve', index: 2 });
    expect(parseControlCommand('YES 1')).toEqual({ kind: 'approve', index: 1 });
    expect(parseControlCommand('ok 12')).toEqual({ kind: 'approve', index: 12 });
    expect(parseControlCommand('reject 3')).toEqual({ kind: 'reject', index: 3 });
    expect(parseControlCommand('no 1')).toEqual({ kind: 'reject', index: 1 });
});

it('parseControlCommand: approve without index is help (never approve ambiguously)', () => {
    expect(parseControlCommand('approve').kind).toBe('help');
    expect(parseControlCommand('approve all').kind).toBe('help');
});

it('parseControlCommand: goal captures the full text', () => {
    const cmd = parseControlCommand('goal grow signups from 100 to 500 per week');
    expect(cmd.kind).toBe('goal');
    expect((cmd as { text: string }).text).toBe('grow signups from 100 to 500 per week');
});

it('parseControlCommand: goal requires at least 5 chars of text', () => {
    expect(parseControlCommand('goal ab').kind).toBe('help');
});

it('parseControlCommand: stop/revoke/unpair', () => {
    expect(parseControlCommand('stop')).toEqual({ kind: 'stop' });
    expect(parseControlCommand('REVOKE')).toEqual({ kind: 'stop' });
    expect(parseControlCommand('unpair')).toEqual({ kind: 'stop' });
});

it('parseControlCommand: anything else is help', () => {
    expect(parseControlCommand('hello there').kind).toBe('help');
    expect(parseControlCommand('').kind).toBe('help');
    expect(parseControlCommand('delete everything').kind).toBe('help');
});

// ─── normalizePhone ───────────────────────────────────────────────────────────

it('normalizePhone strips everything but digits', () => {
    expect(normalizePhone('+91 98765-43210')).toBe('919876543210');
    expect(normalizePhone('(555) 123 4567')).toBe('5551234567');
    expect(normalizePhone('15551234567')).toBe('15551234567');
});
