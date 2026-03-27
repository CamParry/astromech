import type { ViewMode } from '../types/media.js';
import { useLocalState } from './use-local-state.js';

export function useViewMode(pageKey: string, defaultView: ViewMode = 'list') {
    return useLocalState<ViewMode>('view-mode:' + pageKey, defaultView, ['list', 'grid']);
}
