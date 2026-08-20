/**
 * Auth context for the Astromech admin SPA. Session state is owned by React
 * Query (`sessionQueryOptions`) so route `beforeLoad` guards and the React
 * tree read the same cached key. Uses Better Auth endpoints via fetch.
 */

import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { createContext, useContext } from 'react';

declare const __ASTROMECH_BASE_PATH__: string;

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

async function fetchSession(): Promise<AuthUser | null> {
    const res = await fetch(`${__ASTROMECH_BASE_PATH__}/api/me`, {
        credentials: 'include',
    });
    if (!res.ok) return null;
    const { data } = (await res.json()) as MeResponse;
    return { ...data.user, permissions: data.role.permissions };
}

/** React Query options for the session; shared so route `beforeLoad` guards and the React tree read the same cache entry. */
export const sessionQueryOptions = queryOptions({
    queryKey: ['session'] as const,
    queryFn: fetchSession,
    staleTime: 30_000,
    retry: false,
});

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
    children: React.ReactNode;
};

/** Provides the session user and login/logout actions, backed by `sessionQueryOptions`. */
export function AuthProvider({ children }: AuthProviderProps) {
    const queryClient = useQueryClient();
    const { data, isPending } = useQuery(sessionQueryOptions);

    async function login(email: string, password: string): Promise<void> {
        const res = await fetch(`${__ASTROMECH_BASE_PATH__}/api/auth/sign-in/email`, {
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
        await fetch(`${__ASTROMECH_BASE_PATH__}/api/auth/sign-out`, {
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

/** Reads the session user and login/logout actions from `AuthProvider`. */
export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (ctx === null) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return ctx;
}

/** Same as `useAuth`, for call sites within a route already guarded by an auth check. */
export function useRequireAuth(): AuthContextValue {
    return useAuth();
}
