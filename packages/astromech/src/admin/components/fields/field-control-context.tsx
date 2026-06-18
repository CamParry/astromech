import React from 'react';

export type FieldControlState = {
    hasError: boolean;
    errorId: string | undefined;
};

const FieldControlContext = React.createContext<FieldControlState>({
    hasError: false,
    errorId: undefined,
});

export function FieldControlProvider({
    value,
    children,
}: {
    value: FieldControlState;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <FieldControlContext.Provider value={value}>
            {children}
        </FieldControlContext.Provider>
    );
}

/**
 * Lets a control self-mark invalid from the enclosing `FieldWrapper`'s error
 * state. `FieldWrapper` owns the error message; controls add only ARIA + an
 * error class. Outside a wrapper the context default yields no error, so
 * standalone primitive usages are unaffected.
 */
export function useFieldControl(): {
    hasError: boolean;
    ariaProps: { 'aria-invalid'?: true; 'aria-describedby'?: string };
} {
    const { hasError, errorId } = React.useContext(FieldControlContext);
    return {
        hasError,
        ariaProps: hasError
            ? {
                  'aria-invalid': true,
                  ...(errorId !== undefined ? { 'aria-describedby': errorId } : {}),
              }
            : {},
    };
}
