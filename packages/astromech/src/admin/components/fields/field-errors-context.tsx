import React from 'react';

const FieldErrorsContext = React.createContext<Record<string, string[]>>({});

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

export function useFieldError(name: string): string[] | undefined {
    const errors = React.useContext(FieldErrorsContext);
    return errors[name];
}
