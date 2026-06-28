import { describe, it, expect, beforeAll } from 'vitest';
import { capabilityRegistry, syncCoreCapabilities } from './index';
import { getMissionTemplates } from '@/lib/agent/mission-templates';

// The tool barrel self-registers tools; the registry-coverage suite already
// proves importing it is pure (no DB/Redis), so syncing here is safe.
describe('syncCoreCapabilities', () => {
    beforeAll(() => {
        syncCoreCapabilities({ force: true });
    });

    it('projects tools, missions, and playbooks into the registry', () => {
        expect(capabilityRegistry.count({ kind: 'tool' })).toBeGreaterThan(0);
        expect(capabilityRegistry.count({ kind: 'mission' })).toBeGreaterThan(0);
        expect(capabilityRegistry.count({ kind: 'playbook' })).toBeGreaterThan(0);
    });

    it('registers every mission template by namespaced id', () => {
        for (const template of getMissionTemplates()) {
            const cap = capabilityRegistry.get(`mission:${template.id}`);
            expect(cap).toBeDefined();
            expect(cap?.kind).toBe('mission');
            expect(cap?.name).toBe(template.title);
        }
    });

    it('all core capabilities default to source=core and publishable=false', () => {
        for (const cap of capabilityRegistry.list()) {
            expect(cap.source).toBe('core');
            expect(cap.publishable).toBe(false);
            expect(cap.version).toBe('1.0.0');
        }
    });

    it('capability ids are unique and namespaced by kind', () => {
        const ids = capabilityRegistry.list().map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const cap of capabilityRegistry.list()) {
            expect(cap.id.startsWith(`${cap.kind}:`)).toBe(true);
        }
    });

    it('is idempotent — re-sync does not duplicate', () => {
        const before = capabilityRegistry.count();
        syncCoreCapabilities({ force: true });
        expect(capabilityRegistry.count()).toBe(before);
    });
});
