import { useRouterState, useNavigate } from '@tanstack/react-router';

function readParam(search: string, key: string): string | null {
    return new URLSearchParams(search).get(key);
}

export function useQueryState<T extends string>(
    key: string,
    defaultValue: T
): [T, (value: string) => void] {
    const searchStr = useRouterState({ select: (s) => s.location.searchStr });
    const navigate = useNavigate();
    const value = (readParam(searchStr, key) as T | null) ?? defaultValue;

    function setValue(v: string) {
        void navigate({
            search: ((prev: Record<string, unknown>) => ({ ...prev, [key]: v })) as never,
        });
    }

    return [value, setValue];
}

export function useQueryStates<T extends Record<string, string>>(
    defaults: T
): [T, (updates: Partial<T>) => void] {
    const searchStr = useRouterState({ select: (s) => s.location.searchStr });
    const navigate = useNavigate();
    const params = new URLSearchParams(searchStr);

    const values = Object.fromEntries(
        Object.entries(defaults).map(([k, def]) => [k, params.get(k) ?? def])
    ) as T;

    function setValues(updates: Partial<T>) {
        void navigate({
            search: ((prev: Record<string, unknown>) => ({ ...prev, ...updates })) as never,
        });
    }

    return [values, setValues];
}
