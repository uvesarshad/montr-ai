/**
 * WhatsApp API Middleware
 *
 * Provides authentication and authorization checks for WhatsApp API routes
 */

import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { hasWhatsAppPermission, type WhatsAppPermissions } from './permissions';

export interface WhatsAppApiContext {
  userId: string;
  userRole: 'user' | 'admin' | 'super_admin';
  isAdmin: boolean;
  isAgent: boolean;
}

/**
 * Authenticate and get WhatsApp API context
 */
export async function getWhatsAppContext(): Promise<WhatsAppApiContext | NextResponse> {
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id ?? '';
  const role = (session.user.role ?? 'user') as 'user' | 'admin' | 'super_admin';

  // Get organization ID
  return {
    userId,
    userRole: role,
    isAdmin: role === 'admin' || role === 'super_admin',
    isAgent: role === 'user',
  };
}

/**
 * Check if user has required permission
 */
export function requirePermission(
  context: WhatsAppApiContext,
  permission: keyof WhatsAppPermissions
): boolean {
  return hasWhatsAppPermission(context.userRole, permission);
}

/**
 * Require permission or return 403 error
 */
export function requirePermissionOrFail(
  context: WhatsAppApiContext,
  permission: keyof WhatsAppPermissions
): NextResponse | null {
  if (!requirePermission(context, permission)) {
    return NextResponse.json(
      {
        error: 'Forbidden',
        message: `You don't have permission to ${permission.replace(/([A-Z])/g, ' $1').toLowerCase()}`,
      },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Require admin role or return 403 error
 */
export function requireAdminOrFail(context: WhatsAppApiContext): NextResponse | null {
  if (!context.isAdmin) {
    return NextResponse.json(
      {
        error: 'Forbidden',
        message: 'This action requires admin privileges',
      },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Standard error responses
 */
export const WhatsAppApiErrors = {
  unauthorized: () =>
    NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),

  forbidden: (message?: string) =>
    NextResponse.json(
      { error: 'Forbidden', message: message || 'You do not have permission to perform this action' },
      { status: 403 }
    ),

  notFound: (resource: string = 'Resource') =>
    NextResponse.json({ error: `${resource} not found` }, { status: 404 }),

  badRequest: (message: string) =>
    NextResponse.json({ error: 'Bad Request', message }, { status: 400 }),

  conflict: (message: string) =>
    NextResponse.json({ error: 'Conflict', message }, { status: 409 }),

  serverError: (message: string = 'Internal server error') =>
    NextResponse.json({ error: 'Server Error', message }, { status: 500 }),
};

/**
 * Example usage in an API route:
 *
 * export async function POST(request: Request) {
 *   const context = await getWhatsAppContext();
 *   if (context instanceof NextResponse) return context;
 *
 *   const permissionError = requirePermissionOrFail(context, 'canCreateCampaigns');
 *   if (permissionError) return permissionError;
 *
 *   // Continue with the API logic...
 * }
 */
