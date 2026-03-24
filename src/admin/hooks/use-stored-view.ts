import { useState } from 'react';
import type { ViewMode } from '../types/media.js';

const STORAGE_PREFIX = 'am:view:';

function read(pageKey: string): ViewMode {
    try {
        const stored = localStorage.getItem(STORAGE_PREFIX + pageKey);
        if (stored === 'grid' || stored === 'list') return stored;
    } catch {
        // localStorage unavailable
    }
    return 'grid';
}

export function useStoredView(pageKey: string): [ViewMode, (v: ViewMode) => void] {
    const [view, setViewState] = useState<ViewMode>(() => read(pageKey));

    function setView(v: ViewMode) {
        setViewState(v);
        try {
            localStorage.setItem(STORAGE_PREFIX + pageKey, v);
        } catch {
            // ignore
        }
    }

    return [view, setView];
}
