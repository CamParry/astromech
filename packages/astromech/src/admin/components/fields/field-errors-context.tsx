import React from 'react';

const FieldErrorsContext = React.createContext<Record<string, string[]>>({});
const FieldWarningsContext = React.createContext<Record<string, string[]>>({});

export function FieldErrorsProvider({
    value,
    children,
}: {
    value: Record<string, string[]>;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <FieldErrorsContext.Provider value={value}>
            {children}
        </FieldErrorsContext.Provider>
    );
}

/** Advisory messages, keyed by the same full field paths as the errors. */
export function FieldWarningsProvider({
    value,
    children,
}: {
    value: Record<string, string[]>;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <FieldWarningsContext.Provider value={value}>
            {children}
        </FieldWarningsContext.Provider>
    );
}

export function useFieldError(name: string): string[] | undefined {
    const errors = React.useContext(FieldErrorsContext);
    return errors[name];
}

export function useFieldWarning(name: string): string[] | undefined {
    const warnings = React.useContext(FieldWarningsContext);
    return warnings[name];
}
