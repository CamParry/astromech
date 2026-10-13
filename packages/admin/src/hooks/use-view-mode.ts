import type { ViewMode } from '../types/media';
import { useLocalState } from './use-local-state';

const VIEW_MODES: readonly ViewMode[] = ['list', 'grid'];

/**
 * The view a list shows, remembered in the browser under `key`. The view is
 * always one of `views`: a stored or default view outside them falls back to
 * the first of them.
 */
export function useViewMode(
    key: string,
    {
        views = VIEW_MODES,
        defaultView,
    }: { views?: readonly ViewMode[]; defaultView?: ViewMode | undefined } = {}
): [ViewMode, (value: ViewMode) => void] {
    const initial =
        defaultView !== undefined && views.includes(defaultView)
            ? defaultView
            : (views[0] ?? 'list');
    return useLocalState<ViewMode>('view-mode:' + key, initial, views);
}
