import React from 'react';

/**
 * How a field reports what the author did with it.
 *
 * `FormField` is the only place a field's full `_id`-bracket path is known —
 * containers drop the reported path when they bubble a change up — so the
 * reporters travel by context rather than being prop-drilled through every
 * container down to the leaf.
 */
export type FieldValidationHandlers = {
    /** The author changed this field's value. */
    onFieldChange: (path: string) => void;
    /** Focus left this field. */
    onFieldBlur: (path: string) => void;
};

const noop = (): undefined => undefined;

// Default to no-ops so every other `FormField` consumer — plugin admin pages,
// settings forms — renders exactly as it did before, with no provider in scope.
const FieldValidationContext = React.createContext<FieldValidationHandlers>({
    onFieldChange: noop,
    onFieldBlur: noop,
});

export function FieldValidationProvider({
    value,
    children,
}: {
    value: FieldValidationHandlers;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <FieldValidationContext.Provider value={value}>
            {children}
        </FieldValidationContext.Provider>
    );
}

export function useFieldValidationHandlers(): FieldValidationHandlers {
    return React.useContext(FieldValidationContext);
}
