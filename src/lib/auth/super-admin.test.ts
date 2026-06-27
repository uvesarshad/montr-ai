import { describe, it, expect, beforeEach } from 'vitest';
import { isSuperAdminEmail, getSuperAdminEmail } from './super-admin';

describe('super-admin helpers', () => {
    beforeEach(() => {
        delete process.env.SUPER_ADMIN_EMAIL;
        delete process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL;
    });

    it('returns null when neither env var is set', () => {
        expect(getSuperAdminEmail()).toBeNull();
        expect(isSuperAdminEmail('foo@example.com')).toBe(false);
    });

    it('reads SUPER_ADMIN_EMAIL (server-only) preferentially', () => {
        process.env.SUPER_ADMIN_EMAIL = 'Server-Owner@Example.com';
        process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL = 'legacy@example.com';
        expect(getSuperAdminEmail()).toBe('server-owner@example.com');
        expect(isSuperAdminEmail('server-owner@example.com')).toBe(true);
        expect(isSuperAdminEmail('legacy@example.com')).toBe(false);
    });

    it('falls back to NEXT_PUBLIC_SUPER_ADMIN_EMAIL for backward compat', () => {
        process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL = 'Legacy@Example.com';
        expect(getSuperAdminEmail()).toBe('legacy@example.com');
        expect(isSuperAdminEmail('legacy@example.com')).toBe(true);
    });

    it('is case-insensitive on comparison', () => {
        process.env.SUPER_ADMIN_EMAIL = 'admin@example.com';
        expect(isSuperAdminEmail('ADMIN@example.com')).toBe(true);
        expect(isSuperAdminEmail('Admin@Example.com')).toBe(true);
    });

    it('returns false for empty / undefined inputs', () => {
        process.env.SUPER_ADMIN_EMAIL = 'admin@example.com';
        expect(isSuperAdminEmail(undefined)).toBe(false);
        expect(isSuperAdminEmail(null)).toBe(false);
        expect(isSuperAdminEmail('')).toBe(false);
    });
});
