import React from 'react';

export type FieldControlState = {
    hasError: boolean;
    /** Optional: external callers construct this state, and may predate warnings. */
    hasWarning?: boolean;
    /** Id of whichever message the wrapper rendered, error or warning. */
    errorId: string | undefined;
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
 * Lets a control self-mark from the enclosing `FieldWrapper`'s message state.
 * `FieldWrapper` owns the message; controls add only ARIA + a class. A warning
 * describes the control but never sets `aria-invalid`: the value is advisory,
 * not rejected, and an invalid control would be announced as an error and could
 * block a native submit. Outside a wrapper the context default yields nothing.
 */
export function useFieldControl(): {
    hasError: boolean;
    hasWarning: boolean;
    ariaProps: { 'aria-invalid'?: true; 'aria-describedby'?: string };
} {
    const {
        hasError,
        hasWarning = false,
        errorId,
    } = React.useContext(FieldControlContext);
    const describedBy = errorId !== undefined ? { 'aria-describedby': errorId } : {};
    if (hasError) {
        return {
            hasError,
            hasWarning,
            ariaProps: { 'aria-invalid': true, ...describedBy },
        };
    }
    return { hasError, hasWarning, ariaProps: hasWarning ? describedBy : {} };
}
