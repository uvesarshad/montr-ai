
import { it, expect } from 'vitest';
// Importing the barrel registers every tool with the registry.
import { toolRegistry } from './index';
import { AGENT_DEFINITIONS } from '../multi-agent/agent-definitions';

/**
 * Tools that are deliberately NOT wired to any specialist agent and are only
 * reachable through general-agent's '*' wildcard. Anything else that drifts
 * out of the specialist lists fails this suite — wire it or allowlist it here
 * with a reason.
 */
const GENERAL_ONLY_TOOLS = new Set([
    // setPlanStep is auto-available mission plumbing; specialists list createPlan only.
    'setPlanStep',
]);

it('every tool referenced by a specialist exists in the registry', () => {
    const registered = new Set(toolRegistry.getAllTools().map(t => t.name));
    for (const agent of AGENT_DEFINITIONS) {
        if (agent.tools.includes('*')) continue;
        for (const toolName of agent.tools) {
            expect(registered.has(toolName)).toBeTruthy();
        }
    }
});

it('every registered tool is reachable from at least one specialist (or allowlisted general-only)', () => {
    const wired = new Set<string>();
    for (const agent of AGENT_DEFINITIONS) {
        if (agent.tools.includes('*')) continue;
        for (const toolName of agent.tools) wired.add(toolName);
    }

    const orphans = toolRegistry.getAllTools()
        .map(t => t.name)
        .filter(name => !wired.has(name) && !GENERAL_ONLY_TOOLS.has(name));

    expect(orphans).toEqual([]);
});
