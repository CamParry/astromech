import type { ViewMode } from '../types/media';
import { useLocalState } from './use-local-state';

type UseViewModeOptions = {
    storageKey?: string;
    defaultView?: ViewMode;
};

export function useViewMode(
    pageKey: string,
    defaultView: ViewMode = 'list',
    options?: UseViewModeOptions
) {
    const key = options?.storageKey ?? pageKey;
    const effectiveDefault = options?.defaultView ?? defaultView;
    return useLocalState<ViewMode>('view-mode:' + key, effectiveDefault, [
        'list',
        'grid',
    ]);
}
