import { useState } from 'react';

const STORAGE_PREFIX = 'am:state:';

export function useLocalState<T extends string>(
    key: string,
    defaultValue: T,
    allow: string[] = []
): [T, (value: T) => void] {
    const [value, _setValue] = useState<T>(() => {
        const initialValue = localStorage.getItem(STORAGE_PREFIX + key) || defaultValue;
        if (allow.includes(initialValue)) {
            return initialValue as T;
        }
        return defaultValue as T;
    });

    function setValue(value: T) {
        if (!allow.includes(value)) {
            console.warn(
                `Attempted to set invalid value "${value}" for key "${key}". Allowed values are: ${allow.join(', ')}.`
            );
            return;
        }

        _setValue(value);
        try {
            localStorage.setItem(STORAGE_PREFIX + key, value ?? '');
        } catch {
            // ignore
        }
    }

    return [value, setValue];
}
