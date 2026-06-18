import React, { useState, useRef, useEffect } from 'react';
import './inline-title.css';

// ============================================================================
// InlineTitle — click-to-edit label shared by blocks & repeater item headers.
// Stores into the reserved `_title` key. Empty commits omit the key entirely
// (default-by-absence), falling back to the supplied default label.
// ============================================================================

type InlineTitleProps = {
    /** Current custom title (the stored `_title`), or undefined when unset. */
    value: string | undefined;
    /** Default label shown when no custom title is set (also the placeholder). */
    fallback: string;
    /** Commit a new title; `undefined` clears it. Only fired when changed. */
    onCommit: (next: string | undefined) => void;
    /** Accessible label for the edit affordance / input. */
    editLabel: string;
    /** Read-only mode — renders static text, not editable. */
    disabled?: boolean;
};

export function InlineTitle({
    value,
    fallback,
    onCommit,
    editLabel,
    disabled,
}: InlineTitleProps): React.ReactElement {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editing && inputRef.current !== null) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editing]);

    if (disabled === true) {
        return <span className="am-inline-title-static">{value ?? fallback}</span>;
    }

    function commit(): void {
        const trimmed = draft.trim();
        const next = trimmed === '' ? undefined : trimmed;
        if (next !== (value ?? undefined)) onCommit(next);
        setEditing(false);
    }

    if (editing) {
        return (
            <input
                ref={inputRef}
                type="text"
                className="am-inline-title-input"
                value={draft}
                placeholder={fallback}
                aria-label={editLabel}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        commit();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditing(false);
                    }
                }}
            />
        );
    }

    return (
        <button
            type="button"
            className="am-inline-title"
            aria-label={editLabel}
            title={editLabel}
            onClick={() => {
                setDraft(value ?? '');
                setEditing(true);
            }}
        >
            <span className="am-inline-title-text">{value ?? fallback}</span>
        </button>
    );
}
