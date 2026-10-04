/**
 * Auth context for the Astromech admin SPA. Session state is owned by React
 * Query (`sessionQueryOptions`) so route `beforeLoad` guards and the React
 * tree read the same cached key. Uses Better Auth endpoints via fetch.
 */

import type { QueryClient } from '@tanstack/react-query';
import type { Me } from 'astromech';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { createContext, useContext } from 'react';
import { queryKeys } from '../hooks/use-query-keys';

declare const __ASTROMECH_BASE_PATH__: string;

export type AuthUser = {
    id: string;
    name: string;
    email: string;
    image: string | null;
    role: string;
    permissions: string[];
};

type AuthContextValue = {
    user: AuthUser | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
};

/** What `GET /api/me` answers. */
type MeResponse = { data: Me };

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
    queryKey: queryKeys.auth.session(),
    queryFn: fetchSession,
    staleTime: 30_000,
    retry: false,
});

/** React Query options for whether the install still needs first-run setup; the login route reads it and the setup page writes it. */
export const setupCheckQueryOptions = queryOptions({
    queryKey: queryKeys.auth.setupCheck(),
    queryFn: fetchSetupCheck,
    retry: false,
});

async function fetchSetupCheck(): Promise<{ needsSetup: boolean }> {
    const res = await fetch(`${__ASTROMECH_BASE_PATH__}/api/setup/check`, {
        credentials: 'include',
    });
    if (!res.ok) throw new Error(`Setup check failed with status ${res.status}`);
    return (await res.json()) as { needsSetup: boolean };
}

/**
 * End the session and clear it from the cache. The `/logout` route calls this,
 * so leaving a form with unsaved changes asks before the session ends.
 */
export async function logout(queryClient: QueryClient): Promise<void> {
    await fetch(`${__ASTROMECH_BASE_PATH__}/api/auth/sign-out`, {
        method: 'POST',
        credentials: 'include',
    });
    queryClient.setQueryData(sessionQueryOptions.queryKey, null);
}

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
    children: React.ReactNode;
};

/** Provides the session user and the login action, backed by `sessionQueryOptions`. */
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

    return (
        <AuthContext.Provider value={{ user: data ?? null, isLoading: isPending, login }}>
            {children}
        </AuthContext.Provider>
    );
}

/** Reads the session user and the login action from `AuthProvider`. */
export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (ctx === null) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return ctx;
}
