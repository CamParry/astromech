/**
 * UI context for the Astromech admin SPA.
 *
 * Manages global UI state such as sidebar open/closed and shortcuts modal.
 * Theme state is managed separately by ThemeProvider (context/theme.tsx).
 */

import React, { createContext, useContext, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

type UIContextValue = {
    sidebarOpen: boolean;
    toggleSidebar: () => void;
    setSidebarOpen: (open: boolean) => void;
    shortcutsOpen: boolean;
    setShortcutsOpen: (open: boolean) => void;
};

// ============================================================================
// Context
// ============================================================================

const UIContext = createContext<UIContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

type UIProviderProps = {
    children: React.ReactNode;
};

export function UIProvider({ children }: UIProviderProps) {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);

    function toggleSidebar() {
        setSidebarOpen((prev) => !prev);
    }

    return (
        <UIContext.Provider value={{ sidebarOpen, toggleSidebar, setSidebarOpen, shortcutsOpen, setShortcutsOpen }}>
            {children}
        </UIContext.Provider>
    );
}

// ============================================================================
// Hook
// ============================================================================

export function useUI(): UIContextValue {
    const ctx = useContext(UIContext);
    if (ctx === null) {
        throw new Error('useUI must be used within a UIProvider');
    }
    return ctx;
}
