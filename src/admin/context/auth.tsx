/**
 * Auth context for the Astromech admin SPA.
 *
 * Provides the current session user, loading state, and login/logout actions.
 * Uses Better Auth endpoints via fetch with `credentials: 'include'`.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';

declare const __ASTROMECH_API_ROUTE__: string;

// ============================================================================
// Types
// ============================================================================

export type AuthUser = {
    id: string;
    name: string;
    email: string;
    image: string | null;
    roleSlug: string;
    permissions: string[];
};

type AuthContextValue = {
    user: AuthUser | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
};

// ============================================================================
// Context
// ============================================================================

const AuthContext = createContext<AuthContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

type AuthProviderProps = {
    children: React.ReactNode;
};

type MeResponse = {
    data: {
        user: {
            id: string;
            name: string;
            email: string;
            image: string | null;
            roleSlug: string;
        };
        role: {
            slug: string;
            name: string;
            permissions: string[];
            isBuiltIn: boolean;
        };
    };
};

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    async function fetchMe(): Promise<void> {
        const res = await fetch(`${__ASTROMECH_API_ROUTE__}/me`, {
            credentials: 'include',
        });

        if (!res.ok) {
            setUser(null);
            return;
        }

        const { data } = (await res.json()) as MeResponse;
        setUser({
            ...data.user,
            permissions: data.role.permissions,
        });
    }

    useEffect(() => {
        fetchMe()
            .catch(() => {
                setUser(null);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, []);

    async function login(email: string, password: string): Promise<void> {
        const res = await fetch(`${__ASTROMECH_API_ROUTE__}/auth/sign-in/email`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { message?: string };
            throw new Error(data.message ?? 'Login failed');
        }

        await fetchMe();
    }

    async function logout(): Promise<void> {
        await fetch(`${__ASTROMECH_API_ROUTE__}/auth/sign-out`, {
            method: 'POST',
            credentials: 'include',
        });
        setUser(null);
    }

    return <AuthContext.Provider value={{ user, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

// ============================================================================
// Hooks
// ============================================================================

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (ctx === null) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return ctx;
}

export function useRequireAuth(): AuthContextValue {
    return useAuth();
}
