/**
 * WhatsApp RBAC Permission System
 *
 * Defines role-based permissions for WhatsApp features
 *
 * Roles:
 * - Admin (org admin/super_admin): Full access to all WhatsApp features
 * - Agent (org user): Limited to conversation management and messaging
 */

export type WhatsAppUserRole = 'admin' | 'agent';

export interface WhatsAppPermissions {
  // Account Management
  canManageAccounts: boolean;
  canConnectAccounts: boolean;
  canDisconnectAccounts: boolean;
  canViewAccountSettings: boolean;

  // Template Management
  canCreateTemplates: boolean;
  canEditTemplates: boolean;
  canDeleteTemplates: boolean;
  canSubmitTemplates: boolean;
  canViewAllTemplates: boolean;

  // Campaign Management
  canCreateCampaigns: boolean;
  canEditCampaigns: boolean;
  canDeleteCampaigns: boolean;
  canStartCampaigns: boolean;
  canPauseCampaigns: boolean;
  canViewAllCampaigns: boolean;
  canDuplicateCampaigns: boolean;
  canTestCampaigns: boolean;

  // Conversation Management
  canViewAllConversations: boolean;
  canViewAssignedConversations: boolean;
  canAssignConversations: boolean;
  canReassignConversations: boolean;
  canCloseConversations: boolean;
  canReopenConversations: boolean;

  // Messaging
  canSendMessages: boolean;
  canSendMediaMessages: boolean;
  canUseTemplates: boolean;
  canAddNotes: boolean;
  canViewNotes: boolean;

  // Contact Management
  canCreateContacts: boolean;
  canEditContacts: boolean;
  canDeleteContacts: boolean;
  canImportContacts: boolean;
  canExportContacts: boolean;
  canManageContactGroups: boolean;
  canManageCustomFields: boolean;
  canViewAllContacts: boolean;

  // Automation
  canManageAutoReplies: boolean;
  canManageWorkflows: boolean;
  canManageChatbot: boolean;
  canConfigureAI: boolean;

  // Analytics & Reporting
  canViewOwnAnalytics: boolean;
  canViewTeamAnalytics: boolean;
  canViewAllAnalytics: boolean;
  canExportReports: boolean;

  // Settings
  canManageSettings: boolean;
  canManageTeam: boolean;
  canViewAuditLogs: boolean;
}

/**
 * Get WhatsApp role from user role
 */
export function getWhatsAppRole(userRole: 'user' | 'admin' | 'super_admin'): WhatsAppUserRole {
  return userRole === 'user' ? 'agent' : 'admin';
}

/**
 * Get permissions for a WhatsApp role
 */
export function getWhatsAppPermissions(role: WhatsAppUserRole): WhatsAppPermissions {
  if (role === 'admin') {
    return {
      // Account Management - Full access
      canManageAccounts: true,
      canConnectAccounts: true,
      canDisconnectAccounts: true,
      canViewAccountSettings: true,

      // Template Management - Full access
      canCreateTemplates: true,
      canEditTemplates: true,
      canDeleteTemplates: true,
      canSubmitTemplates: true,
      canViewAllTemplates: true,

      // Campaign Management - Full access
      canCreateCampaigns: true,
      canEditCampaigns: true,
      canDeleteCampaigns: true,
      canStartCampaigns: true,
      canPauseCampaigns: true,
      canViewAllCampaigns: true,
      canDuplicateCampaigns: true,
      canTestCampaigns: true,

      // Conversation Management - Full access
      canViewAllConversations: true,
      canViewAssignedConversations: true,
      canAssignConversations: true,
      canReassignConversations: true,
      canCloseConversations: true,
      canReopenConversations: true,

      // Messaging - Full access
      canSendMessages: true,
      canSendMediaMessages: true,
      canUseTemplates: true,
      canAddNotes: true,
      canViewNotes: true,

      // Contact Management - Full access
      canCreateContacts: true,
      canEditContacts: true,
      canDeleteContacts: true,
      canImportContacts: true,
      canExportContacts: true,
      canManageContactGroups: true,
      canManageCustomFields: true,
      canViewAllContacts: true,

      // Automation - Full access
      canManageAutoReplies: true,
      canManageWorkflows: true,
      canManageChatbot: true,
      canConfigureAI: true,

      // Analytics & Reporting - Full access
      canViewOwnAnalytics: true,
      canViewTeamAnalytics: true,
      canViewAllAnalytics: true,
      canExportReports: true,

      // Settings - Full access
      canManageSettings: true,
      canManageTeam: true,
      canViewAuditLogs: true,
    };
  }

  // Agent permissions (limited)
  return {
    // Account Management - No access
    canManageAccounts: false,
    canConnectAccounts: false,
    canDisconnectAccounts: false,
    canViewAccountSettings: false,

    // Template Management - View only
    canCreateTemplates: false,
    canEditTemplates: false,
    canDeleteTemplates: false,
    canSubmitTemplates: false,
    canViewAllTemplates: true,

    // Campaign Management - View only
    canCreateCampaigns: false,
    canEditCampaigns: false,
    canDeleteCampaigns: false,
    canStartCampaigns: false,
    canPauseCampaigns: false,
    canViewAllCampaigns: true,
    canDuplicateCampaigns: false,
    canTestCampaigns: false,

    // Conversation Management - Limited to assigned
    canViewAllConversations: false,
    canViewAssignedConversations: true,
    canAssignConversations: true, // Can assign to other agents
    canReassignConversations: true,
    canCloseConversations: true,
    canReopenConversations: true,

    // Messaging - Full access
    canSendMessages: true,
    canSendMediaMessages: true,
    canUseTemplates: true,
    canAddNotes: true,
    canViewNotes: true,

    // Contact Management - Limited
    canCreateContacts: true, // Can create from conversations
    canEditContacts: true,
    canDeleteContacts: false,
    canImportContacts: false,
    canExportContacts: false,
    canManageContactGroups: false,
    canManageCustomFields: false,
    canViewAllContacts: true,

    // Automation - No access
    canManageAutoReplies: false,
    canManageWorkflows: false,
    canManageChatbot: false,
    canConfigureAI: false,

    // Analytics & Reporting - Own data only
    canViewOwnAnalytics: true,
    canViewTeamAnalytics: false,
    canViewAllAnalytics: false,
    canExportReports: false,

    // Settings - No access
    canManageSettings: false,
    canManageTeam: false,
    canViewAuditLogs: false,
  };
}

/**
 * Check if user has permission for a specific action
 */
export function hasWhatsAppPermission(
  userRole: 'user' | 'admin' | 'super_admin',
  permission: keyof WhatsAppPermissions
): boolean {
  const whatsappRole = getWhatsAppRole(userRole);
  const permissions = getWhatsAppPermissions(whatsappRole);
  return permissions[permission];
}

/**
 * Check if user can access a conversation
 */
export function canAccessConversation(
  userRole: 'user' | 'admin' | 'super_admin',
  userId: string,
  conversation: { assignedToId?: string | null }
): boolean {
  const whatsappRole = getWhatsAppRole(userRole);

  // Admins can access all conversations
  if (whatsappRole === 'admin') {
    return true;
  }

  // Agents can only access assigned conversations or unassigned ones
  return !conversation.assignedToId || conversation.assignedToId === userId;
}

/**
 * Check if user can modify a resource (template, campaign, etc.)
 */
export function canModifyResource(
  userRole: 'user' | 'admin' | 'super_admin',
  userId: string,
  resource: { createdBy?: string }
): boolean {
  const whatsappRole = getWhatsAppRole(userRole);

  // Admins can modify all resources
  if (whatsappRole === 'admin') {
    return true;
  }

  // Agents can only modify resources they created
  return resource.createdBy === userId;
}

/**
 * Filter conversations based on user permissions
 */
export function getConversationFilter(
  userRole: 'user' | 'admin' | 'super_admin',
  userId: string
) {
  const whatsappRole = getWhatsAppRole(userRole);

  // Admins can see all conversations
  if (whatsappRole === 'admin') {
    return {};
  }

  // Agents can only see assigned conversations or unassigned ones
  return {
    $or: [{ assignedToId: userId }, { assignedToId: null }],
  };
}

/**
 * Get list of actions user can perform in conversation UI
 */
export interface ConversationActions {
  canSendMessage: boolean;
  canSendMedia: boolean;
  canAddNote: boolean;
  canChangeStatus: boolean;
  canChangePriority: boolean;
  canAssignToOthers: boolean;
  canClose: boolean;
  canReopen: boolean;
  canViewHistory: boolean;
  canExport: boolean;
}

export function getConversationActions(
  userRole: 'user' | 'admin' | 'super_admin',
  userId: string,
  conversation: { assignedToId?: string | null; status: string }
): ConversationActions {
  const whatsappRole = getWhatsAppRole(userRole);
  const permissions = getWhatsAppPermissions(whatsappRole);
  const hasAccess = canAccessConversation(userRole, userId, conversation);

  if (!hasAccess) {
    return {
      canSendMessage: false,
      canSendMedia: false,
      canAddNote: false,
      canChangeStatus: false,
      canChangePriority: false,
      canAssignToOthers: false,
      canClose: false,
      canReopen: false,
      canViewHistory: false,
      canExport: false,
    };
  }

  const isOpen = conversation.status !== 'closed';
  const isClosed = conversation.status === 'closed';

  return {
    canSendMessage: permissions.canSendMessages && isOpen,
    canSendMedia: permissions.canSendMediaMessages && isOpen,
    canAddNote: permissions.canAddNotes,
    canChangeStatus: isOpen,
    canChangePriority: isOpen,
    canAssignToOthers: permissions.canAssignConversations,
    canClose: permissions.canCloseConversations && isOpen,
    canReopen: permissions.canReopenConversations && isClosed,
    canViewHistory: true,
    canExport: permissions.canExportReports,
  };
}
