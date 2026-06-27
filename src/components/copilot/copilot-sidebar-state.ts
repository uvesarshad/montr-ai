export type {
  AgentBrandOption as CopilotBrandOption,
  AgentStarterPrompt as CopilotStarterPrompt,
} from '@/components/agent/agent-launcher-state';

export {
  getAgentStarterPrompts as getCopilotStarterPrompts,
  normalizeAgentBrandsResponse as normalizeCopilotBrandsResponse,
} from '@/components/agent/agent-launcher-state';
