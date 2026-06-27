
import { it, expect } from 'vitest';
import { AGENT_DEFINITIONS, getAccessibleAgents } from './agent-definitions';

// ─── Static wiring consistency (no registry import — pure definitions) ────────

it('every specialist has the mission-control tools', () => {
    for (const agent of AGENT_DEFINITIONS) {
        if (agent.tools.includes('*')) continue;
        for (const required of ['createPlan', 'completeMission', 'reportBlocked']) {
            expect(agent.tools.includes(required)).toBeTruthy();
        }
    }
});

it('no duplicate tool entries within an agent definition', () => {
    for (const agent of AGENT_DEFINITIONS) {
        const seen = new Set<string>();
        for (const t of agent.tools) {
            expect(!seen.has(t)).toBeTruthy();
            seen.add(t);
        }
    }
});

it('agent ids are unique and kebab-case', () => {
    const ids = new Set<string>();
    for (const agent of AGENT_DEFINITIONS) {
        expect(!ids.has(agent.id)).toBeTruthy();
        expect(agent.id).toMatch(/^[a-z][a-z-]*[a-z]$/);
        ids.add(agent.id);
    }
});

it('exactly one catch-all agent with wildcard tools and no keywords', () => {
    const wildcards = AGENT_DEFINITIONS.filter(a => a.tools.includes('*'));
    expect(wildcards.length).toBe(1);
    expect(wildcards[0].id).toBe('general-agent');
    expect(wildcards[0].intentKeywords.length).toBe(0);
});

it('voice-agent exists and carries all four voice tools', () => {
    const voice = AGENT_DEFINITIONS.find(a => a.id === 'voice-agent');
    expect(voice).toBeTruthy();
    for (const t of ['initiate_call', 'schedule_call', 'get_call_transcript', 'bulk_call']) {
        expect(voice!.tools.includes(t)).toBeTruthy();
    }
});

it('knowledge-agent carries the brand memory tools', () => {
    const knowledge = AGENT_DEFINITIONS.find(a => a.id === 'knowledge-agent');
    expect(knowledge).toBeTruthy();
    for (const t of ['read_memory', 'write_memory', 'delete_memory', 'list_memory_keys']) {
        expect(knowledge!.tools.includes(t)).toBeTruthy();
    }
});

it('automation-agent stays folded into ops-agent', () => {
    expect(AGENT_DEFINITIONS.find(a => a.id === 'automation-agent')).toBe(undefined);
    const ops = AGENT_DEFINITIONS.find(a => a.id === 'ops-agent');
    expect(ops).toBeTruthy();
    expect(ops!.tools.includes('triggerWorkflow')).toBeTruthy();
    expect(ops!.intentKeywords.includes('automation')).toBeTruthy();
});

it('getAccessibleAgents returns every agent for plain users (no role-gated specialists today)', () => {
    const userAgents = getAccessibleAgents('user');
    expect(userAgents.length).toBe(AGENT_DEFINITIONS.length);
});
