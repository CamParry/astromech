/**
 * The drawer's open state. The topbar button and the panel are separate slot
 * contributions, so neither can own it.
 */

import { useSyncExternalStore } from 'react';

let open = false;
let toggleButton: HTMLButtonElement | null = null;
const listeners = new Set<() => void>();

/** Re-renders the caller whenever the drawer opens or closes. */
export function useDrawerOpen(): boolean {
    return useSyncExternalStore(subscribe, () => open);
}

/** Flips the drawer between open and closed. */
export function toggleDrawer(): void {
    setOpen(!open);
}

/** Closes the drawer, leaving the panel mounted. */
export function closeDrawer(): void {
    setOpen(false);
}

/** The button registers its element so the panel can hand focus back on close. */
export function registerToggleButton(element: HTMLButtonElement | null): void {
    toggleButton = element;
}

/** Returns focus to the topbar button after the panel closes. */
export function focusToggleButton(): void {
    toggleButton?.focus();
}

/** Records the new state and notifies subscribers. */
function setOpen(next: boolean): void {
    if (next === open) return;
    open = next;
    for (const listener of listeners) listener();
}

/** Subscribes a `useSyncExternalStore` caller, returning its unsubscribe. */
function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
