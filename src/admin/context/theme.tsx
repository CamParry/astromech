/**
 * Theme context for the Astromech admin SPA.
 *
 * Lives at the root of the app so both auth and protected pages
 * respect the user's saved theme preference.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export type Theme = 'auto' | 'light' | 'dark';

type ThemeContextValue = {
    theme: Theme;
    setTheme: (theme: Theme) => void;
};

// ============================================================================
// Context
// ============================================================================

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ============================================================================
// Helpers
// ============================================================================

function readStoredTheme(): Theme {
    const stored = localStorage.getItem('am-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return 'auto';
}

function applyTheme(theme: Theme) {
    if (theme === 'light' || theme === 'dark') {
        document.documentElement.setAttribute('data-theme', theme);
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

// ============================================================================
// Provider
// ============================================================================

type ThemeProviderProps = {
    children: React.ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
    const [theme, setThemeState] = useState<Theme>('auto');

    useEffect(() => {
        const stored = readStoredTheme();
        setThemeState(stored);
        applyTheme(stored);
    }, []);

    function setTheme(next: Theme) {
        setThemeState(next);
        localStorage.setItem('am-theme', next);
        applyTheme(next);
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
