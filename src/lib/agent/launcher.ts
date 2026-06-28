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
  /**
   * Brand to pin the agent session to (e.g. the brand just onboarded). When set,
   * the launcher selects it instead of falling back to the stored/first brand —
   * this is the fix for the brandId/asset-bridge handoff no-op.
   */
  brandId?: string;
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

  // Persist the target brand up front so any agent surface (quick panel or the
  // full workspace) resolves the right brand even if it mounted earlier.
  if (options.brandId) {
    try {
      localStorage.setItem('agent-brand-id', options.brandId);
      localStorage.setItem('copilot-brand-id', options.brandId);
    } catch {
      // localStorage may be unavailable (private mode) — the event still carries brandId.
    }
  }

  const contextualPrompt = buildAgentPrompt(options.prompt, options.context);
  window.dispatchEvent(new CustomEvent('open-agent', {
    detail: {
      prompt: contextualPrompt,
      brandId: options.brandId,
    },
  }));
}
