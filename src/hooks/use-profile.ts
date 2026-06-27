'use client';

import { useState, useEffect, useCallback } from 'react';

interface UserProfile {
    _id?: string;
    name?: string;
    email?: string;
    username?: string;
    role?: string;
    firstName?: string;
    lastName?: string;
    bio?: string;
    phoneNumber?: string;
    image?: string;
    company?: string;
    organizationName?: string;
    planId?: string;
    canUseOwnApiKeys?: boolean;
    subscriptionStatus?: string;
    razorpaySubscriptionId?: string;
    cancelAtPeriodEnd?: boolean;
    currentPeriodEnd?: string | number | Date;
    billingAddress?: Record<string, string>;
    userApiKeys?: Record<string, string | undefined>;
    [key: string]: unknown;
}

export const useProfile = () => {
    const [data, setData] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchProfile = useCallback(async () => {
        try {
            setIsLoading(true);
            const res = await fetch('/api/v2/users/me');
            if (res.ok) {
                const userData = await res.json();
                setData(userData);
            } else {
                // Silently fail or log if unauthorized (might be not logged in)
                console.error('Failed to fetch profile:', res.statusText);
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);

    const updateProfile = async (updates: Record<string, unknown>) => {
        try {
            const res = await fetch('/api/v2/users/me', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });

            if (!res.ok) throw new Error('Failed to update profile');

            const updatedUser = await res.json();
            setData(updatedUser);
            return updatedUser;
        } catch (error: unknown) {
            console.error('Error updating profile:', error);
            throw error;
        }
    };

    return {
        data,
        isLoading,
        updateProfile,
        refresh: fetchProfile,
    };
};
