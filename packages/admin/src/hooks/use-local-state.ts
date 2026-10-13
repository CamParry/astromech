import { useState } from 'react';

const STORAGE_PREFIX = 'am:state:';

/**
 * A string value remembered in the browser under `key`, always one of `allow`.
 * When `key` changes the hook reads the value stored under the new key in the
 * same render, so the old key's value never shows for the new one.
 */
export function useLocalState<T extends string>(
    key: string,
    defaultValue: T,
    allow: readonly string[] = []
): [T, (value: T) => void] {
    const [state, setState] = useState(() => ({
        key,
        value: readStored(key, defaultValue, allow),
    }));

    // Adjusting state during render (React's pattern for state that follows a
    // prop) re-renders before the commit, so no frame shows the old value.
    let current = state;
    if (state.key !== key) {
        current = { key, value: readStored(key, defaultValue, allow) };
        setState(current);
    }

    function setValue(value: T) {
        if (!allow.includes(value)) {
            console.warn(
                `Attempted to set invalid value "${value}" for key "${key}". Allowed values are: ${allow.join(', ')}.`
            );
            return;
        }

        setState({ key, value });
        try {
            localStorage.setItem(STORAGE_PREFIX + key, value ?? '');
        } catch {
            // ignore
        }
    }

    return [current.value, setValue];
}

function readStored<T extends string>(
    key: string,
    defaultValue: T,
    allow: readonly string[]
): T {
    const stored = localStorage.getItem(STORAGE_PREFIX + key) || defaultValue;
    if (allow.includes(stored)) {
        return stored as T;
    }
    return defaultValue;
}
