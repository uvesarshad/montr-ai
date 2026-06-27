import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/lib/auth-client';

// Types
interface AdminUser {
    _id: string;
    email?: string;
    name: string;
    username?: string;
    role: 'user' | 'admin' | 'super_admin';
    organizationName?: string;
    planId?: string;
    planName?: string;
    canUseOwnApiKeys?: boolean;
    createdAt: string;
    updatedAt: string;
}

interface AdminOrganization {
    _id: string;
    name: string;
    email?: string;
    adminId: string;
    adminEmail?: string;
    adminName?: string;
    memberCount: number;
    memberLimit: number;
    members?: {
        _id: string;
        name: string;
        email: string;
        role: 'user' | 'admin';
    }[];
    subscriptionPlanId?: string;
    status: 'active' | 'inactive' | 'suspended';
    createdAt: string;
    updatedAt: string;
}

interface AdminStats {
    totalUsers: number;
    totalOrganizations?: number;
    totalCanvases: number;
    totalDocuments: number;
    usersByRole?: {
        super_admin: number;
        admin: number;
        user: number;
    };
    memberLimit?: number;
    organizationName?: string;
}

// =====================
// useAdminProfile Hook
// =====================

interface UseAdminProfileResult {
    role: 'user' | 'admin' | 'super_admin' | null;
    userId: string | null;
    isLoading: boolean;
    isSuperAdmin: boolean;
    isAdmin: boolean;
}

export function useAdminProfile(): UseAdminProfileResult {
    const { data: session, status } = useSession();

    const role = ((session?.user as { role?: string })?.role) as 'user' | 'admin' | 'super_admin' | null;
    const userId = ((session?.user as { id?: string })?.id) ?? null;

    return {
        role,
        userId,
        isLoading: status === 'loading',
        isSuperAdmin: role === 'super_admin',
        isAdmin: role === 'admin' || role === 'super_admin',
    };
}

// =====================
// useAdminStats Hook
// =====================

interface UseAdminStatsResult {
    stats: AdminStats | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}

export function useAdminStats(): UseAdminStatsResult {
    const { status } = useSession();
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchStats = useCallback(async () => {
        if (status !== 'authenticated') {
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            const response = await fetch('/api/v2/admin/stats', {
                credentials: 'include',
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Unauthorized');
                }
                throw new Error('Failed to fetch stats');
            }

            const data = await response.json();
            setStats(data);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Unknown error'));
        } finally {
            setIsLoading(false);
        }
    }, [status]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    return {
        stats,
        isLoading,
        error,
        refetch: fetchStats,
    };
}

// =====================
// useAdminUsers Hook
// =====================

interface UseAdminUsersResult {
    users: AdminUser[] | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
    updateUser: (userId: string, updates: Partial<AdminUser>) => Promise<void>;
    deleteUser: (userId: string) => Promise<void>;
    createUser: (data: { email: string; name: string; username?: string; role?: 'user' | 'admin'; }) => Promise<AdminUser>;
    bulkAction: (userIds: string[], action: 'delete' | 'update_role' | 'update_plan' | 'update_organization', data?: string | Record<string, unknown>) => Promise<{ modifiedCount: number }>;
}

export function useAdminUsers(): UseAdminUsersResult {
    const { status } = useSession();
    const [users, setUsers] = useState<AdminUser[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchUsers = useCallback(async () => {
        if (status !== 'authenticated') {
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            const response = await fetch('/api/v2/admin/users', {
                credentials: 'include',
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Unauthorized');
                }
                throw new Error('Failed to fetch users');
            }

            const data = await response.json();
            setUsers(data.users || []);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Unknown error'));
        } finally {
            setIsLoading(false);
        }
    }, [status]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const updateUser = useCallback(async (userId: string, updates: Partial<AdminUser>) => {
        const response = await fetch(`/api/v2/admin/users?userId=${userId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(updates),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update user');
        }

        // Refresh the list
        await fetchUsers();
    }, [fetchUsers]);

    const deleteUser = useCallback(async (userId: string) => {
        const response = await fetch(`/api/v2/admin/users?userId=${userId}`, {
            method: 'DELETE',
            credentials: 'include',
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete user');
        }

        // Update local state
        setUsers(prev => prev ? prev.filter(u => u._id !== userId) : null);
    }, []);

    const createUser = useCallback(async (data: {
        email: string;
        name: string;
        username?: string;
        role?: 'user' | 'admin';
    }): Promise<AdminUser> => {
        const response = await fetch('/api/v2/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create user');
        }

        const newUser = await response.json();

        // Refresh the list
        await fetchUsers();

        return newUser;
    }, [fetchUsers]);

    const bulkAction = useCallback(async (userIds: string[], action: 'delete' | 'update_role' | 'update_plan' | 'update_organization', data?: string | Record<string, unknown>) => {
        const response = await fetch('/api/v2/admin/users/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ userIds, action, data }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Bulk operation failed');
        }

        const result = await response.json();
        await fetchUsers();
        return result;
    }, [fetchUsers]);

    return {
        users,
        isLoading,
        error,
        refetch: fetchUsers,
        updateUser,
        deleteUser,
        createUser,
        bulkAction,
    };
}

// =====================
// useAdminOrganizations Hook
// =====================

interface UseAdminOrganizationsResult {
    organizations: AdminOrganization[] | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
    createOrganization: (data: { name: string; adminId?: string; memberLimit?: number }) => Promise<AdminOrganization>;
    updateOrganization: (orgId: string, updates: Partial<AdminOrganization>) => Promise<void>;
    deleteOrganization: (orgId: string) => Promise<void>;
}

export function useAdminOrganizations(): UseAdminOrganizationsResult {
    const { status } = useSession();
    const [organizations, setOrganizations] = useState<AdminOrganization[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchOrganizations = useCallback(async () => {
        if (status !== 'authenticated') {
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            const response = await fetch('/api/v2/admin/organizations', {
                credentials: 'include',
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Unauthorized');
                }
                throw new Error('Failed to fetch organizations');
            }

            const data = await response.json();
            setOrganizations(data.organizations || []);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Unknown error'));
        } finally {
            setIsLoading(false);
        }
    }, [status]);

    useEffect(() => {
        fetchOrganizations();
    }, [fetchOrganizations]);

    const createOrganization = useCallback(async (data: {
        name: string;
        email?: string;
        adminId?: string;
        memberLimit?: number
    }): Promise<AdminOrganization> => {
        const response = await fetch('/api/v2/admin/organizations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create organization');
        }

        const newOrg = await response.json();
        await fetchOrganizations();
        return newOrg;
    }, [fetchOrganizations]);

    const updateOrganization = useCallback(async (orgId: string, updates: Partial<AdminOrganization>) => {
        const response = await fetch(`/api/v2/admin/organizations?orgId=${orgId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(updates),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update organization');
        }

        await fetchOrganizations();
    }, [fetchOrganizations]);

    const deleteOrganization = useCallback(async (orgId: string) => {
        const response = await fetch(`/api/v2/admin/organizations?orgId=${orgId}`, {
            method: 'DELETE',
            credentials: 'include',
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete organization');
        }

        setOrganizations(prev => prev ? prev.filter(o => o._id !== orgId) : null);
    }, []);

    return {
        organizations,
        isLoading,
        error,
        refetch: fetchOrganizations,
        createOrganization,
        updateOrganization,
        deleteOrganization,
    };
}

// =====================
// useAdminPlans Hook
// =====================

interface AdminPlan {
    _id: string;
    id: string;
    name: string;
    displayName: string;
    description: string;
    price: number;
    priceINR?: number;
    priceUSD?: number;
    billingInterval: 'monthly' | 'yearly' | 'lifetime';
    features: Record<string, unknown>;
    status: 'active' | 'inactive';
    stripeProductId?: string;
    stripePriceId?: string;
    razorpayPlanId?: string;
    createdAt: string;
    updatedAt: string;
}

interface UseAdminPlansResult {
    plans: AdminPlan[] | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
    createPlan: (data: Omit<AdminPlan, '_id' | 'id' | 'createdAt' | 'updatedAt' | 'status'>) => Promise<AdminPlan>;
    updatePlan: (planId: string, updates: Partial<AdminPlan>) => Promise<void>;
    deletePlan: (planId: string) => Promise<void>;
}

export function useAdminPlans(): UseAdminPlansResult {
    const { status } = useSession();
    const [plans, setPlans] = useState<AdminPlan[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchPlans = useCallback(async () => {
        if (status !== 'authenticated') {
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            const response = await fetch('/api/v2/admin/plans', {
                credentials: 'include',
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Unauthorized');
                }
                throw new Error('Failed to fetch plans');
            }

            const data = await response.json();
            setPlans(data.plans || []);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Unknown error'));
        } finally {
            setIsLoading(false);
        }
    }, [status]);

    useEffect(() => {
        fetchPlans();
    }, [fetchPlans]);

    const createPlan = useCallback(async (data: Omit<AdminPlan, '_id' | 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<AdminPlan> => {
        const response = await fetch('/api/v2/admin/plans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create plan');
        }

        const newPlan = await response.json();
        await fetchPlans();
        return newPlan;
    }, [fetchPlans]);

    const updatePlan = useCallback(async (planId: string, updates: Partial<AdminPlan>) => {
        const response = await fetch(`/api/v2/admin/plans?planId=${planId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(updates),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update plan');
        }

        await fetchPlans();
    }, [fetchPlans]);

    const deletePlan = useCallback(async (planId: string) => {
        const response = await fetch(`/api/v2/admin/plans?planId=${planId}`, {
            method: 'DELETE',
            credentials: 'include',
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete plan');
        }

        setPlans(prev => prev ? prev.filter(p => p._id !== planId) : null);
    }, []);

    return {
        plans,
        isLoading,
        error,
        refetch: fetchPlans,
        createPlan,
        updatePlan,
        deletePlan,
    };
}
