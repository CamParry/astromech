/**
 * @vitest-environment happy-dom
 *
 * The dev readout, which exists to keep the AI context assembly path exercised.
 * The assertions therefore check that it renders the formatter's own output
 * verbatim rather than a rendering of its own.
 */

import type { AIContextReference } from '@/types/ai-context';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { AIContextReadout } from '@/admin/components/dev/ai-context-readout';
import { AIContextProvider, useAIContext } from '@/admin/context/ai-context';
import { formatAIContextMessage } from '@/utilities/ai-context';

const postsList: AIContextReference = { kind: 'entries', type: 'posts', label: 'Posts' };

describe('AIContextReadout', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('should render the declared count on a collapsed toggle', () => {
        const mounted = mountReadout(postsList);

        expect(mounted.toggle().textContent).toBe('AI context (1)');
        expect(mounted.panel()).toBeNull();
        mounted.unmount();
    });

    it('should render the formatter content verbatim once opened', () => {
        const mounted = mountReadout(postsList);

        mounted.click();

        const expected = formatAIContextMessage([
            { reference: postsList, depth: 0, order: 0 },
        ]);
        expect(mounted.host.querySelector('pre')?.textContent).toBe(expected?.content);
        expect(mounted.panel()?.textContent).toContain('role: system');
        mounted.unmount();
    });

    it('should report zero references and say so in the panel', () => {
        const mounted = mountReadout(null);

        mounted.click();

        expect(mounted.toggle().textContent).toBe('AI context (0)');
        expect(mounted.panel()?.textContent).toBe('No references declared');
        mounted.unmount();
    });

    it('should restore the open state from local storage', () => {
        const first = mountReadout(postsList);
        first.click();
        first.unmount();

        const second = mountReadout(postsList);
        expect(second.panel()).not.toBeNull();
        second.unmount();
    });
});

type Mounted = {
    host: HTMLElement;
    toggle: () => HTMLButtonElement;
    panel: () => HTMLElement | null;
    click: () => void;
    unmount: () => void;
};

/** Mount the readout under a provider with one declaring route. */
function mountReadout(reference: AIContextReference | null): Mounted {
    function DeclaringRoute(): null {
        useAIContext(reference);
        return null;
    }

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
        root.render(
            <AIContextProvider>
                <DeclaringRoute />
                <AIContextReadout />
            </AIContextProvider>
        );
    });

    const toggle = (): HTMLButtonElement => {
        const element = host.querySelector<HTMLButtonElement>('.am-ai-readout-toggle');
        if (element === null) throw new Error('readout toggle not rendered');
        return element;
    };

    return {
        host,
        toggle,
        panel: () => host.querySelector<HTMLElement>('.am-ai-readout-panel'),
        click: () => {
            act(() => {
                toggle().click();
            });
        },
        unmount: () => {
            act(() => root.unmount());
            host.remove();
        },
    };
}
