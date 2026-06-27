/**
 * Agent Permission System
 * 
 * Controls what tools, agents, and actions each user role can access.
 * Combines with the brand-level `enabledTools` and `requireApproval` settings.
 */

export interface AgentPermissions {
    allowedTools: string[] | '*';     // '*' = all tools
    allowedAgents: string[] | '*';    // '*' = all agents
    canApproveActions: boolean;       // Can approve HITL pending actions
    canCreateScheduledTasks: boolean; // Can create cron-based tasks
    canManageBrandContext: boolean;   // Can edit brand AI persona
    maxSessionsPerHour: number;       // Rate limiting
}

/**
 * Default permissions per role.
 */
const ROLE_PERMISSIONS: Record<string, AgentPermissions> = {
    user: {
        allowedTools: [
            'getCurrentDate',
            'searchKnowledgeBase',
            'getContact',
            'getDealsPipeline',
            'getAnalytics',
        ],
        allowedAgents: ['general-agent', 'knowledge-agent'],
        canApproveActions: false,
        canCreateScheduledTasks: false,
        canManageBrandContext: false,
        maxSessionsPerHour: 30,
    },
    admin: {
        allowedTools: '*',
        allowedAgents: '*',
        canApproveActions: true,
        canCreateScheduledTasks: true,
        canManageBrandContext: true,
        maxSessionsPerHour: 100,
    },
    super_admin: {
        allowedTools: '*',
        allowedAgents: '*',
        canApproveActions: true,
        canCreateScheduledTasks: true,
        canManageBrandContext: true,
        maxSessionsPerHour: -1, // Unlimited
    },
};

/**
 * Get permissions for a user role.
 */
export function getPermissions(role: string = 'user'): AgentPermissions {
    return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.user;
}

/**
 * Check if a user can use a specific tool.
 * Considers both role permissions and brand-level enabledTools.
 */
export function canUseTool(
    role: string,
    toolName: string,
    brandEnabledTools?: string[]
): boolean {
    const permissions = getPermissions(role);

    // Check role-level permission
    if (permissions.allowedTools !== '*') {
        if (!permissions.allowedTools.includes(toolName)) {
            return false;
        }
    }

    // Check brand-level permission (if configured)
    if (brandEnabledTools && !brandEnabledTools.includes(toolName)) {
        return false;
    }

    return true;
}

/**
 * Check if a user can use a specific agent.
 */
export function canUseAgent(role: string, agentId: string): boolean {
    const permissions = getPermissions(role);

    if (permissions.allowedAgents === '*') return true;
    return permissions.allowedAgents.includes(agentId);
}

/**
 * Get the effective tool list for a user, combining role + brand permissions.
 */
export function getEffectiveTools(
    role: string,
    allToolNames: string[],
    brandEnabledTools?: string[]
): string[] {
    const permissions = getPermissions(role);

    let allowedByRole = permissions.allowedTools === '*'
        ? allToolNames
        : permissions.allowedTools;

    if (brandEnabledTools) {
        allowedByRole = (allowedByRole as string[]).filter(t => brandEnabledTools.includes(t));
    }

    return allowedByRole;
}
