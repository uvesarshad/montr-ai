/**
 * Multi-Agent Barrel Export
 * Import this to access all multi-agent components.
 */

export { AGENT_DEFINITIONS, getAgentById, getAccessibleAgents } from './agent-definitions';
export type { AgentDefinition } from './agent-definitions';

export { routeToAgent, routeToAgentWithLLM, detectExplicitAgentRequest, getAgentToolFilter } from './agent-coordinator';
export type { AgentRouteResult } from './agent-coordinator';

export { getSession, updateSession, clearSession, getSessionStats } from './agent-session-manager';

export { getPermissions, canUseTool, canUseAgent, getEffectiveTools } from './agent-permissions';
export type { AgentPermissions } from './agent-permissions';
