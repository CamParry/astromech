/**
 * Entry i18n namespace seam. Label keys resolve against a namespace derived
 * from the route: plugin entry types use the plugin name, root types use
 * `translation`. Entry pages wrap their body in `EntryNamespaceProvider`.
 */

import type { Label } from '@/types/index';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { resolveLabel } from './labels';

const CORE_NS = 'translation';

const EntryNamespaceContext = React.createContext<string>(CORE_NS);

/** Provides the active i18n namespace to `useEntryNamespace` and `useLabel`. */
export function EntryNamespaceProvider({
    namespace,
    children,
}: {
    namespace: string;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <EntryNamespaceContext.Provider value={namespace}>
            {children}
        </EntryNamespaceContext.Provider>
    );
}

/** Reads the active i18n namespace from `EntryNamespaceProvider`. */
export function useEntryNamespace(): string {
    return React.useContext(EntryNamespaceContext);
}

/** Map an entry surface's cache scope (`''` root, else plugin name) to a namespace. */
export function namespaceForScope(cacheScope: string): string {
    return cacheScope === '' ? CORE_NS : cacheScope;
}

/** Hook returning a `(label, name) => string` resolver bound to the active namespace. */
export function useLabel(): (value: Label | undefined, name: string) => string {
    const { t } = useTranslation();
    const ns = useEntryNamespace();
    return React.useCallback(
        (value: Label | undefined, name: string) => resolveLabel(value, name, t, ns),
        [t, ns]
    );
}
