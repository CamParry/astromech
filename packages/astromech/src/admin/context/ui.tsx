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

type UiContextValue = {
    sidebarOpen: boolean;
    toggleSidebar: () => void;
    setSidebarOpen: (open: boolean) => void;
    shortcutsOpen: boolean;
    setShortcutsOpen: (open: boolean) => void;
};

// ============================================================================
// Context
// ============================================================================

const UiContext = createContext<UiContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

type UiProviderProps = {
    children: React.ReactNode;
};

export function UiProvider({ children }: UiProviderProps) {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);

    function toggleSidebar() {
        setSidebarOpen((prev) => !prev);
    }

    return (
        <UiContext.Provider
            value={{
                sidebarOpen,
                toggleSidebar,
                setSidebarOpen,
                shortcutsOpen,
                setShortcutsOpen,
            }}
        >
            {children}
        </UiContext.Provider>
    );
}

// ============================================================================
// Hook
// ============================================================================

export function useUi(): UiContextValue {
    const ctx = useContext(UiContext);
    if (ctx === null) {
        throw new Error('useUi must be used within a UiProvider');
    }
    return ctx;
}
