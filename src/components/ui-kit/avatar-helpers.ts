/**
 * ui-kit · avatar helpers — deterministic color + initials from a name.
 *
 * Kept in their own (non-component) module so `primitives.tsx` exports only
 * components (React Fast Refresh requirement / react-doctor `only-export-components`).
 */

const AV_COLORS = ['#e2654a', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#6366f1', '#ef4444', '#14b8a6'];

export const avatarColor = (s = '') => AV_COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length];

export const avatarInitials = (n = '') =>
  n
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
