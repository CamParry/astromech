/**
 * Sibling-value access for field renderers.
 *
 * The entry field tree renders from a single root `values` object that
 * re-renders on every change (see `EntryFieldColumn`). Two contexts expose
 * that to any field renderer that needs to read a *sibling's* value — e.g. a
 * computed/preview field — without prop-drilling or coupling to the form
 * library:
 *
 *  - `FieldValuesProvider` carries the root entry values, set once at the
 *    column root.
 *  - `FieldPathProvider` carries the current field's full dotted path, set by
 *    `FormField` around each control. Inside a `group`/`repeater` this path is
 *    prefixed (e.g. `seo.title`), so siblings resolve relative to the
 *    container.
 *
 * `useFieldValue('title')` reads the sibling at the same level as the calling
 * field. Deep cross-container reads are out of scope.
 */

import React from 'react';

const FieldValuesContext = React.createContext<Record<string, unknown> | null>(null);
const FieldPathContext = React.createContext<string | null>(null);

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
 * Read the current value of a sibling field by name, relative to the calling
 * field's container. Reactive: the field re-renders when the value changes
 * (the whole tree re-renders on edit). Returns `undefined` outside a field
 * tree or when the sibling has no value yet.
 */
export function useFieldValue(name: string): unknown {
    const values = React.useContext(FieldValuesContext);
    const path = React.useContext(FieldPathContext);
    if (values === null) return undefined;
    const prefix = path ? path.split('.').slice(0, -1) : [];
    return readPath(values, [...prefix, name]);
}
