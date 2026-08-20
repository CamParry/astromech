/**
 * Sibling-value access for field renderers. `FieldValuesProvider` carries
 * the root entry values, `FieldPathProvider` carries the current field's
 * dotted path; `useFieldValue(name)` reads a sibling relative to it.
 */

import React from 'react';

const FieldValuesContext = React.createContext<Record<string, unknown> | null>(null);
const FieldPathContext = React.createContext<string | null>(null);

/** Provides the root entry values, set once at the column root. */
export function FieldValuesProvider({
    values,
    children,
}: {
    values: Record<string, unknown>;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <FieldValuesContext.Provider value={values}>
            {children}
        </FieldValuesContext.Provider>
    );
}

/** Provides the current field's dotted path, set by `FormField` around each control. */
export function FieldPathProvider({
    path,
    children,
}: {
    path: string;
    children: React.ReactNode;
}): React.ReactElement {
    return <FieldPathContext.Provider value={path}>{children}</FieldPathContext.Provider>;
}

function readPath(root: Record<string, unknown>, segments: string[]): unknown {
    let current: unknown = root;
    for (const segment of segments) {
        if (current === null || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[segment];
    }
    return current;
}

/**
 * Reads the current value of a sibling field by name, relative to the
 * calling field's container. Reactive; returns `undefined` outside a field
 * tree or when the sibling has no value yet.
 */
export function useFieldValue(name: string): unknown {
    const values = React.useContext(FieldValuesContext);
    const path = React.useContext(FieldPathContext);
    if (values === null) return undefined;
    const prefix = path ? path.split('.').slice(0, -1) : [];
    return readPath(values, [...prefix, name]);
}
