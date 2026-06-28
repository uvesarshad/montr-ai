import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityRegistry } from './capability-registry';

describe('CapabilityRegistry', () => {
    let registry: CapabilityRegistry;

    beforeEach(() => {
        registry = new CapabilityRegistry();
    });

    it('registers and gets a capability with sane defaults', () => {
        const cap = registry.register({
            id: 'tool:createContact',
            kind: 'tool',
            name: 'createContact',
            description: 'Create a CRM contact',
        });

        expect(cap.version).toBe('1.0.0');
        expect(cap.source).toBe('core');
        expect(cap.publishable).toBe(false);

        const got = registry.get('tool:createContact');
        expect(got).toEqual(cap);
        expect(registry.has('tool:createContact')).toBe(true);
    });

    it('throws when id is missing', () => {
        expect(() => registry.register({ id: '', kind: 'tool', name: 'x', description: '' }))
            .toThrow(/id is required/);
    });

    it('overwrites on duplicate id', () => {
        registry.register({ id: 'mission:a', kind: 'mission', name: 'A', description: 'first' });
        registry.register({ id: 'mission:a', kind: 'mission', name: 'A', description: 'second' });
        expect(registry.count()).toBe(1);
        expect(registry.get('mission:a')?.description).toBe('second');
    });

    it('registerAll adds many', () => {
        registry.registerAll([
            { id: 'tool:a', kind: 'tool', name: 'a', description: '' },
            { id: 'mission:b', kind: 'mission', name: 'b', description: '' },
            { id: 'playbook:c', kind: 'playbook', name: 'c', description: '' },
        ]);
        expect(registry.count()).toBe(3);
    });

    it('lists with kind / source / publishable / search filters', () => {
        registry.registerAll([
            { id: 'tool:a', kind: 'tool', name: 'alpha', description: 'create things', source: 'core' },
            { id: 'tool:b', kind: 'tool', name: 'beta', description: 'community thing', source: 'community', publishable: true },
            { id: 'mission:c', kind: 'mission', name: 'gamma', description: 'overlay', source: 'overlay' },
        ]);

        expect(registry.list({ kind: 'tool' })).toHaveLength(2);
        expect(registry.list({ source: 'community' })).toHaveLength(1);
        expect(registry.list({ publishable: true })).toHaveLength(1);
        expect(registry.list({ publishable: false })).toHaveLength(2);
        expect(registry.list({ search: 'CREATE' }).map((c) => c.id)).toEqual(['tool:a']);
        expect(registry.list({ kind: 'tool', source: 'community' })).toHaveLength(1);
    });

    it('marks a capability publishable and back', () => {
        registry.register({ id: 'tool:a', kind: 'tool', name: 'a', description: '' });
        expect(registry.get('tool:a')?.publishable).toBe(false);

        const marked = registry.markPublishable('tool:a');
        expect(marked?.publishable).toBe(true);
        expect(registry.list({ publishable: true })).toHaveLength(1);

        const unmarked = registry.markPublishable('tool:a', false);
        expect(unmarked?.publishable).toBe(false);
    });

    it('markPublishable returns undefined for unknown id', () => {
        expect(registry.markPublishable('nope')).toBeUndefined();
    });

    it('unregister and clear', () => {
        registry.register({ id: 'tool:a', kind: 'tool', name: 'a', description: '' });
        expect(registry.unregister('tool:a')).toBe(true);
        expect(registry.unregister('tool:a')).toBe(false);

        registry.registerAll([
            { id: 'tool:x', kind: 'tool', name: 'x', description: '' },
            { id: 'tool:y', kind: 'tool', name: 'y', description: '' },
        ]);
        registry.clear();
        expect(registry.count()).toBe(0);
    });
});
