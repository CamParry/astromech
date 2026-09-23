/**
 * Entry i18n namespace seam. Label keys resolve against a namespace: a plugin's
 * entry types and globals use the plugin name, the site's use `translation`.
 * Entry pages wrap their body in `EntryNamespaceProvider`.
 */

import type { Label } from 'astromech';
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
function useEntryNamespace(): string {
    return React.useContext(EntryNamespaceContext);
}

/** The namespace a resource's labels resolve against: its plugin's, or the core one. */
export function labelNamespace(plugin: string | undefined): string {
    return plugin ?? CORE_NS;
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
