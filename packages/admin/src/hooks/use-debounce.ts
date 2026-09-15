import { useEffect, useState } from 'react';

/** Trailing-edge debounce: returns `value` once it has held still for `delay` ms. */
export function useDebounce<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(id);
    }, [value, delay]);
    return debounced;
}
