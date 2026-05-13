/**
 * Auth context for the Astromech admin SPA.
 *
 * Session state is owned by React Query (`sessionQueryOptions`) so that route
 * `beforeLoad` guards can ensureQueryData the same key the React tree reads.
 * Uses Better Auth endpoints via fetch with `credentials: 'include'`.
 */

import React, { createContext, useContext } from 'react';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';

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

// ============================================================================
// Session query
// ============================================================================

async function fetchSession(): Promise<AuthUser | null> {
    const res = await fetch(`${__ASTROMECH_API_ROUTE__}/me`, {
        credentials: 'include',
    });
    if (!res.ok) return null;
    const { data } = (await res.json()) as MeResponse;
    return { ...data.user, permissions: data.role.permissions };
}

export const sessionQueryOptions = queryOptions({
    queryKey: ['session'] as const,
    queryFn: fetchSession,
    staleTime: 30_000,
    retry: false,
});

// ============================================================================
// Context
// ============================================================================

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
    children: React.ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
    const queryClient = useQueryClient();
    const { data, isPending } = useQuery(sessionQueryOptions);

    async function login(email: string, password: string): Promise<void> {
        const res = await fetch(`${__ASTROMECH_API_ROUTE__}/auth/sign-in/email`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { message?: string };
            throw new Error(body.message ?? 'Login failed');
        }
        await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey });
    }

    async function logout(): Promise<void> {
        await fetch(`${__ASTROMECH_API_ROUTE__}/auth/sign-out`, {
            method: 'POST',
            credentials: 'include',
        });
        queryClient.setQueryData(sessionQueryOptions.queryKey, null);
    }

    return (
        <AuthContext.Provider
            value={{ user: data ?? null, isLoading: isPending, login, logout }}
        >
            {children}
        </AuthContext.Provider>
    );
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
