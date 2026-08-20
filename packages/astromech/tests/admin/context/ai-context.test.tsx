/**
 * @vitest-environment happy-dom
 *
 * The AI context store, whose whole job is churn control: `useSyncExternalStore`
 * re-renders forever on a fresh snapshot, and a route that re-renders must not
 * be reshuffled against its siblings. Insertion order is kept; sorting is the
 * message formatter's job.
 *
 * There is no `@testing-library/react` here, so the hook tests drive a real
 * React root directly (same approach as use-field-validation.test.tsx).
 */

import type { AiContextItem, AiContextReference } from '@/types/ai-context';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import {
    AiContextProvider,
    createAiContextStore,
    useAiContext,
    useAiContextItems,
} from '@/admin/context/ai-context';

const postsList: AiContextReference = { kind: 'entries', type: 'posts', label: 'Posts' };
const postEntry: AiContextReference = {
    kind: 'entries',
    type: 'posts',
    id: 'abc',
    label: 'Hello world',
};

describe('createAiContextStore', () => {
    it('should keep the order minted on first registration when a key re-registers', () => {
        const store = createAiContextStore();
        store.register('a', postsList, 0);
        store.register('b', postEntry, 1);

        store.register('a', { ...postsList, label: 'All posts' }, 0);

        const snapshot = store.getSnapshot();
        expect(snapshot.map((item) => item.order)).toEqual([0, 1]);
        expect(snapshot[0]!.reference.label).toBe('All posts');
    });

    it('should ignore a registration that changes nothing', () => {
        const store = createAiContextStore();
        store.register('a', postsList, 0);
        const before = store.getSnapshot();
        let notified = 0;
        store.subscribe(() => (notified += 1));

        store.register('a', { ...postsList }, 0);

        expect(notified).toBe(0);
        expect(store.getSnapshot()).toBe(before);
    });

    it('should notify and replace the snapshot when the label changes', () => {
        const store = createAiContextStore();
        store.register('a', postsList, 0);
        const before = store.getSnapshot();
        let notified = 0;
        store.subscribe(() => (notified += 1));

        store.register('a', { ...postsList, label: 'All posts' }, 0);

        expect(notified).toBe(1);
        expect(store.getSnapshot()).not.toBe(before);
        expect(store.getSnapshot()[0]!.reference.label).toBe('All posts');
    });

    it('should notify and drop the item on unregister, and stay quiet for an unknown key', () => {
        const store = createAiContextStore();
        store.register('a', postsList, 0);
        let notified = 0;
        store.subscribe(() => (notified += 1));

        store.unregister('a');
        store.unregister('nobody');

        expect(notified).toBe(1);
        expect(store.getSnapshot()).toEqual([]);
    });

    it('should stop calling a listener once it unsubscribes', () => {
        const store = createAiContextStore();
        let notified = 0;
        const unsubscribe = store.subscribe(() => (notified += 1));

        store.register('a', postsList, 0);
        unsubscribe();
        store.register('b', postEntry, 1);

        expect(notified).toBe(1);
    });

    it('should keep the snapshot in insertion order rather than sorting by depth', () => {
        const store = createAiContextStore();
        store.register('deep', postEntry, 5);
        store.register('shallow', postsList, 0);

        expect(store.getSnapshot().map((item) => item.depth)).toEqual([5, 0]);
    });
});

describe('useAiContext', () => {
    it('should publish the reference the route declares', () => {
        const mounted = mountAdmin(postsList);

        expect(mounted.items()).toEqual([{ reference: postsList, depth: 0, order: 0 }]);
        mounted.unmount();
    });

    it('should publish nothing while the reference is null', () => {
        const mounted = mountAdmin(null);

        expect(mounted.items()).toEqual([]);
        mounted.unmount();
    });

    it('should not re-register when the caller passes an equal object literal', () => {
        const mounted = mountAdmin(postsList);
        const before = mounted.items();

        mounted.setReference({ ...postsList });

        // A re-register would rebuild the snapshot, so identity is the proof.
        expect(mounted.items()).toBe(before);
        mounted.unmount();
    });

    it('should republish when a field of the reference changes', () => {
        const mounted = mountAdmin(postsList);

        mounted.setReference({ ...postsList, label: 'All posts' });

        expect(mounted.items()[0]!.reference.label).toBe('All posts');
        mounted.unmount();
    });

    it('should withdraw the reference when the route unmounts or goes null', () => {
        const mounted = mountAdmin(postsList);

        mounted.setReference(null);
        expect(mounted.items()).toEqual([]);

        mounted.setReference(postEntry);
        mounted.hideRoute();
        expect(mounted.items()).toEqual([]);
        mounted.unmount();
    });
});

type Mounted = {
    /** What a consumer of `useAiContextItems` sees right now. */
    items: () => readonly AiContextItem[];
    setReference: (reference: AiContextReference | null) => void;
    hideRoute: () => void;
    unmount: () => void;
};

/** Mount a provider with one declaring route and one reading consumer. */
function mountAdmin(initial: AiContextReference | null): Mounted {
    let items: readonly AiContextItem[] = [];
    let setState: React.Dispatch<React.SetStateAction<AppState>> | undefined;

    type AppState = { reference: AiContextReference | null; visible: boolean };

    function DeclaringRoute({
        reference,
    }: {
        reference: AiContextReference | null;
    }): null {
        useAiContext(reference);
        return null;
    }

    function Consumer(): null {
        items = useAiContextItems();
        return null;
    }

    function App(): React.ReactElement {
        const [state, set] = React.useState<AppState>({
            reference: initial,
            visible: true,
        });
        setState = set;
        return (
            <AiContextProvider>
                {state.visible ? <DeclaringRoute reference={state.reference} /> : null}
                <Consumer />
            </AiContextProvider>
        );
    }

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
        root.render(<App />);
    });

    const update = (next: Partial<AppState>): void => {
        act(() => {
            setState?.((prev) => ({ ...prev, ...next }));
        });
    };

    return {
        items: () => items,
        setReference: (reference) => update({ reference }),
        hideRoute: () => update({ visible: false }),
        unmount: () => {
            act(() => root.unmount());
            host.remove();
        },
    };
}
