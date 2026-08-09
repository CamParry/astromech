/**
 * The assistant's topbar button, contributed to the shell's `toolbar` slot.
 * It opens the panel that the `right-drawer` slot renders.
 */

import type { ReactElement } from 'react';
import { registerToggleButton, toggleDrawer, useDrawerOpen } from '../drawer-state';
import './assistant-button.css';

export default function AssistantButton(): ReactElement {
    const open = useDrawerOpen();

    return (
        <button
            ref={registerToggleButton}
            type="button"
            className="am-topbar-action-btn am-assistant-button"
            aria-expanded={open}
            aria-label={open ? 'Close the assistant' : 'Open the assistant'}
            onClick={toggleDrawer}
        >
            <SparklesIcon />
        </button>
    );
}

/** Lucide's `Sparkles`, inlined: this package takes no icon dependency. */
function SparklesIcon(): ReactElement {
    return (
        <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
            <path d="M20 2v4" />
            <path d="M22 4h-4" />
            <circle cx="4" cy="20" r="2" />
        </svg>
    );
}
