import React from 'react';

export type FieldControlState = {
    hasError: boolean;
    /** Optional: external callers construct this state, and may predate warnings. */
    hasWarning?: boolean;
    /** Id of whichever message the wrapper rendered, error or warning. */
    errorId: string | undefined;
    /** Id of the field's description, when it has one. */
    descriptionId?: string | undefined;
    /** Id of the field's label. */
    labelId?: string | undefined;
    /** Id the label's `htmlFor` points at, when the label names one control. */
    controlId?: string | undefined;
};

const FieldControlContext = React.createContext<FieldControlState>({
    hasError: false,
    hasWarning: false,
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
 * Lets a control self-mark from the enclosing `FieldWrapper`'s state: the ids
 * that name it from the label and describe it by the description and message.
 * A warning never sets `aria-invalid`; outside a wrapper every id is undefined.
 */
export function useFieldControl(): {
    hasError: boolean;
    hasWarning: boolean;
    ariaProps: { 'aria-invalid'?: true; 'aria-describedby'?: string };
    /** The `id` for the field's one control, which the label points at. */
    controlId: string | undefined;
    /** For `aria-labelledby` on a group, or on a control the label cannot point at. */
    labelId: string | undefined;
} {
    const {
        hasError,
        hasWarning = false,
        errorId,
        descriptionId,
        labelId,
        controlId,
    } = React.useContext(FieldControlContext);
    const describedBy = [descriptionId, errorId].filter((id) => id !== undefined);
    return {
        hasError,
        hasWarning,
        ariaProps: {
            ...(hasError ? { 'aria-invalid': true } : {}),
            ...(describedBy.length > 0
                ? { 'aria-describedby': describedBy.join(' ') }
                : {}),
        },
        controlId,
        labelId,
    };
}
