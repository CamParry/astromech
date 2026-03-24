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

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetch(`${__ASTROMECH_API_ROUTE__}/auth/get-session`, {
            credentials: 'include',
        })
            .then(async (res) => {
                if (!res.ok) {
                    setUser(null);
                    return;
                }
                const data = (await res.json()) as { user?: AuthUser } | null;
                setUser(data?.user ?? null);
            })
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

        const data = (await res.json()) as { user?: AuthUser };
        setUser(data.user ?? null);
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
