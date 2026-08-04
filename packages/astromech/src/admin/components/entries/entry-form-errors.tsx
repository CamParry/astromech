import React from 'react';

/**
 * Form-level validation messages for an entry form.
 *
 * A live region is right here where it is wrong on a field: it appears in
 * response to a submit the author just made, and names no field for the
 * announcement to clip.
 */
export function EntryFormErrors({
    messages,
}: {
    messages: string[];
}): React.ReactElement | null {
    if (messages.length === 0) return null;
    return (
        <div className="am-form-errors" role="alert">
            {messages.map((message) => (
                <span key={message}>{message}</span>
            ))}
        </div>
    );
}
