/**
 * Label i18n namespace seam. Label keys resolve against a namespace: a plugin's
 * entry types, globals and admin resources use the plugin name, the site's use
 * `translation`. A form's page wraps its body in `LabelNamespaceProvider`.
 */

import type { Label } from 'astromech';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { resolveLabel } from './labels';

const CORE_NS = 'translation';

const LabelNamespaceContext = React.createContext<string>(CORE_NS);

/** Provides the active i18n namespace to `useLabelNamespace` and `useLabel`. */
export function LabelNamespaceProvider({
    namespace,
    children,
}: {
    namespace: string;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <LabelNamespaceContext.Provider value={namespace}>
            {children}
        </LabelNamespaceContext.Provider>
    );
}

/** Reads the active i18n namespace from `LabelNamespaceProvider`. */
function useLabelNamespace(): string {
    return React.useContext(LabelNamespaceContext);
}

/** The namespace a resource's labels resolve against: its plugin's, or the core one. */
export function labelNamespace(plugin: string | undefined): string {
    return plugin ?? CORE_NS;
}

/** Hook returning a `(label, name) => string` resolver bound to the active namespace. */
export function useLabel(): (value: Label | undefined, name: string) => string {
    const { t } = useTranslation();
    const ns = useLabelNamespace();
    return React.useCallback(
        (value: Label | undefined, name: string) => resolveLabel(value, name, t, ns),
        [t, ns]
    );
}
