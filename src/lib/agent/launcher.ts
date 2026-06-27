export interface AgentLaunchContext {
  source: string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  route?: string;
  notes?: string[];
}

export interface AgentLaunchOptions {
  prompt: string;
  missionId?: string;
  context?: AgentLaunchContext;
}

function normalizeNotes(notes?: string[]) {
  return (notes || []).map((note) => note.trim()).filter(Boolean);
}

export function buildAgentPrompt(prompt: string, context?: AgentLaunchContext) {
  const basePrompt = prompt.trim();

  if (!context) {
    return basePrompt;
  }

  const segments = [
    `Source: ${context.source}`,
    context.entityType
      ? `${context.entityType} ${context.entityLabel || 'record'}${context.entityId ? ` (${context.entityId})` : ''}`
      : '',
    context.route ? `Route: ${context.route}` : '',
    ...normalizeNotes(context.notes),
  ].filter(Boolean);

  if (segments.length === 0) {
    return basePrompt;
  }

  return `${basePrompt}\n\nContext:\n${segments.join('\n')}`;
}

export function buildAgentWorkspaceHref(options: AgentLaunchOptions) {
  if (options.missionId) {
    return `/agent?missionId=${encodeURIComponent(options.missionId)}`;
  }

  const contextualPrompt = buildAgentPrompt(options.prompt, options.context);
  return `/agent?prompt=${encodeURIComponent(contextualPrompt)}`;
}

export function openAgentLauncher(options: AgentLaunchOptions) {
  if (typeof window === 'undefined') {
    return;
  }

  const contextualPrompt = buildAgentPrompt(options.prompt, options.context);
  window.dispatchEvent(new CustomEvent('open-agent', {
    detail: {
      prompt: contextualPrompt,
    },
  }));
}
