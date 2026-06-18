/**
 * Entry i18n namespace seam (spec §4.1).
 *
 * Label keys captured by `t(key)` resolve against a namespace derived from the
 * route: plugin entry types use the plugin name (= route `$name`), root entry
 * types use the core `translation` namespace. The entry pages wrap their body
 * in `EntryNamespaceProvider`; components read it via `useLabel`.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Label } from '@/types/index.js';
import { resolveLabel } from './labels.js';

const CORE_NS = 'translation';

const EntryNamespaceContext = React.createContext<string>(CORE_NS);

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
