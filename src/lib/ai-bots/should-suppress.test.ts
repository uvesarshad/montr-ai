import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';

import { shouldSuppress } from './should-suppress';

describe('shouldSuppress', () => {
  it('returns true for null/undefined conversation', () => {
    expect(shouldSuppress(null)).toBe(true);
    expect(shouldSuppress(undefined)).toBe(true);
  });

  it('returns true when conversation is closed', () => {
    expect(shouldSuppress({ status: 'closed' })).toBe(true);
  });

  it('returns true when assignedToId is set (human took over)', () => {
    expect(shouldSuppress({ assignedToId: new Types.ObjectId() })).toBe(true);
    expect(shouldSuppress({ assignedToId: 'user-id-string' })).toBe(true);
  });

  it('returns false when no human assigned and status is open', () => {
    expect(shouldSuppress({ status: 'open' })).toBe(false);
    expect(shouldSuppress({})).toBe(false);
    expect(shouldSuppress({ assignedToId: null })).toBe(false);
  });

  it('suppresses regardless of status when human is assigned', () => {
    expect(shouldSuppress({ status: 'open', assignedToId: new Types.ObjectId() })).toBe(true);
    expect(shouldSuppress({ status: 'pending', assignedToId: new Types.ObjectId() })).toBe(true);
  });
});
