/**
 * AI context for the Astromech admin SPA. Routes declare what the user is
 * looking at via `useAiContext`; the chat drawer reads the collected
 * references with `useAiContextItems`.
 */

import type { AiContextItem, AiContextReference } from '@/types/ai-context';
import React, {
    createContext,
    useContext,
    useEffect,
    useId,
    useState,
    useSyncExternalStore,
} from 'react';

export type AiContextStore = {
    register(key: string, reference: AiContextReference, depth: number): void;
    unregister(key: string): void;
    subscribe(listener: () => void): () => void;
    getSnapshot(): readonly AiContextItem[];
};

const AiContextStoreContext = createContext<AiContextStore | null>(null);

/**
 * Hold the references currently declared by mounted routes, keyed per hook
 * instance. The snapshot is rebuilt on change and cached, because
 * `useSyncExternalStore` re-renders forever on a fresh array every read.
 */
export function createAiContextStore(): AiContextStore {
    const items = new Map<string, AiContextItem>();
    const listeners = new Set<() => void>();
    let snapshot: readonly AiContextItem[] = [];
    let nextOrder = 0;

    function publish(): void {
        snapshot = [...items.values()];
        for (const listener of listeners) listener();
    }

    return {
        register(key, reference, depth) {
            const existing = items.get(key);
            if (
                existing !== undefined &&
                existing.depth === depth &&
                sameReference(existing.reference, reference)
            ) {
                return;
            }
            // `order` is minted once per key: a re-register must not reshuffle
            // a route against its siblings.
            const order = existing?.order ?? nextOrder++;
            items.set(key, { reference, depth, order });
            publish();
        },
        unregister(key) {
            if (!items.delete(key)) return;
            publish();
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        getSnapshot() {
            return snapshot;
        },
    };
}

/** Compare two references field by field; identity changes on every render. */
function sameReference(a: AiContextReference, b: AiContextReference): boolean {
    return a.kind === b.kind && a.type === b.type && a.id === b.id && a.label === b.label;
}

type AiContextProviderProps = {
    children: React.ReactNode;
};

/** Mounts an `AiContextStore` and makes it available to `useAiContext` and `useAiContextItems`. */
export function AiContextProvider({ children }: AiContextProviderProps) {
    const [store] = useState(() => createAiContextStore());

    return (
        <AiContextStoreContext.Provider value={store}>
            {children}
        </AiContextStoreContext.Provider>
    );
}

/**
 * Declare what this route is showing for as long as it is mounted. A `null`
 * reference declares nothing, so a route can call this unconditionally while
 * its data loads. Lower `depth` is less specific.
 */
export function useAiContext(
    reference: AiContextReference | null,
    options?: { depth?: number }
): void {
    const store = useAiContextStore();
    const key = useId();
    const depth = options?.depth ?? 0;
    // Depend on the fields, not the object: callers pass a fresh literal each render.
    const kind = reference?.kind;
    const type = reference?.type;
    const id = reference?.id;
    const label = reference?.label;

    useEffect(() => {
        if (kind === undefined || label === undefined) {
            store.unregister(key);
            return;
        }
        // Built key by key: `exactOptionalPropertyTypes` rejects explicit undefined.
        const next: AiContextReference = { kind, label };
        if (type !== undefined) next.type = type;
        if (id !== undefined) next.id = id;
        store.register(key, next, depth);
        return () => {
            store.unregister(key);
        };
    }, [store, key, kind, type, id, label, depth]);
}

/** The references declared by every mounted route, in registration order. */
export function useAiContextItems(): readonly AiContextItem[] {
    const store = useAiContextStore();
    return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** Read the store the provider installed. */
function useAiContextStore(): AiContextStore {
    const ctx = useContext(AiContextStoreContext);
    if (ctx === null) {
        throw new Error('AI context hooks must be used within an AiContextProvider');
    }
    return ctx;
}
