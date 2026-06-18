/**
 * Theme context for the Astromech admin SPA.
 *
 * `data-theme` on <html> is the single source of truth for colour. It is set
 * before first paint by the server (from the `am-theme` cookie) or, for
 * first-time visitors, by an inline script in `shell.astro` that reads the
 * system preference. This provider just mirrors that attribute into React so
 * the toggle stays in sync, and writes the cookie when the user toggles.
 */

import React, { createContext, useContext, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export type Theme = 'light' | 'dark';

type ThemeContextValue = {
    theme: Theme;
    setTheme: (theme: Theme) => void;
};

const COOKIE_NAME = 'am-theme';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// ============================================================================
// Context
// ============================================================================

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve the active theme from the `data-theme` attribute already on <html>
 * (set pre-paint by the server/inline script). Falls back to the system
 * preference in the unexpected case it is missing.
 */
function resolveActiveTheme(): Theme {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme): void {
    document.documentElement.setAttribute('data-theme', theme);
}

function persistTheme(theme: Theme): void {
    document.cookie = `${COOKIE_NAME}=${theme}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

// ============================================================================
// Provider
// ============================================================================

type ThemeProviderProps = {
    children: React.ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
    // Resolve synchronously at first render so the toggle is correct the instant
    // it appears (the SPA is client-only, so this runs before anything paints).
    const [theme, setThemeState] = useState<Theme>(resolveActiveTheme);

    function setTheme(next: Theme): void {
        setThemeState(next);
        applyTheme(next);
        persistTheme(next);
    }

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

// ============================================================================
// Hook
// ============================================================================

export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (ctx === null) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return ctx;
}
