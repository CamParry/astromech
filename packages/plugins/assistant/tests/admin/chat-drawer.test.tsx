/**
 * @vitest-environment happy-dom
 *
 * The drawer's approval panel, and what the transcript says about a tool call
 * that has not run.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import type { ComponentProps, ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import ChatDrawer from '../../src/admin/slots/chat-drawer';
import { closeDrawer, toggleDrawer } from '../../src/admin/drawer-state';
import type { ApprovalDecision, ApprovalRequest } from '../../src/types';
import type { ChatEntry, UseChat } from '../../src/admin/use-chat';

let chat: UseChat;

vi.mock('astromech/ui', () => ({
    useAIContextItems: () => [],
    Button: ({
        variant: _variant,
        size: _size,
        ...props
    }: ComponentProps<'button'> & { variant?: string; size?: string }): ReactElement => (
        <button {...props} />
    ),
}));

vi.mock('../../src/admin/use-chat', () => ({ useChat: () => chat }));

// `act` only batches and flushes once React is told it is under test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REQUEST: ApprovalRequest = {
    approvalId: 'ap_1',
    toolCallId: 'toolu_1',
    method: 'entries.page.update',
    toolName: 'entries_page_update',
    message: 'Update the page "Home"?',
    destructive: false,
    arguments: { id: 'page_1' },
};

const DELETION: ApprovalRequest = {
    ...REQUEST,
    approvalId: 'ap_2',
    toolCallId: 'toolu_2',
    method: 'entries.page.delete',
    toolName: 'entries_page_delete',
    message: 'Delete the page "Home"? This cannot be undone.',
    destructive: true,
};

/** A turn calling one tool, the shape a paused response streams back. */
function calling(toolCallId: string, name: string): ChatEntry {
    return {
        kind: 'message',
        message: {
            role: 'assistant',
            content: [{ type: 'tool-call', toolCallId, toolName: name, input: {} }],
        },
    };
}

describe('ChatDrawer approvals', () => {
    beforeEach(() => {
        chat = {
            entries: [],
            tail: '',
            isStreaming: false,
            isRestoring: false,
            pending: [],
            rejected: {},
            send: vi.fn(),
            respond: vi.fn(),
            stop: vi.fn(),
            newChat: vi.fn(),
        };
        closeDrawer();
        toggleDrawer();
    });

    afterEach(() => {
        closeDrawer();
    });

    it('renders no panel while nothing is held', () => {
        const mounted = mountDrawer();

        expect(mounted.panel()).toBeNull();
        mounted.unmount();
    });

    it("puts core's own wording to the user, and never the arguments", () => {
        chat.pending = [REQUEST];
        const mounted = mountDrawer();

        expect(mounted.messages()).toEqual(['Update the page "Home"?']);
        expect(mounted.panel()?.textContent).not.toContain('page_1');
        mounted.unmount();
    });

    it('marks a destructive call as destructive', () => {
        chat.pending = [DELETION];
        const mounted = mountDrawer();

        expect(
            mounted.panel()?.querySelector('.am-assistant-approval--destructive')
        ).not.toBeNull();
        mounted.unmount();
    });

    it('takes focus when it appears', () => {
        chat.pending = [REQUEST];
        const mounted = mountDrawer();

        expect(document.activeElement).toBe(mounted.panel());
        mounted.unmount();
    });

    it('hands focus back to the composer once the last call is answered', () => {
        chat.pending = [REQUEST];
        const mounted = mountDrawer();

        chat.pending = [];
        mounted.rerender();

        expect(document.activeElement).toBe(mounted.prompt());
        mounted.unmount();
    });

    it('answers a lone call as soon as it is approved', () => {
        chat.pending = [REQUEST];
        const mounted = mountDrawer();

        mounted.click('Approve');

        expect(chat.respond).toHaveBeenCalledWith([
            { approvalId: 'ap_1', action: 'approve' },
        ]);
        mounted.unmount();
    });

    it('holds a half-answered pair back until both are decided', () => {
        chat.pending = [REQUEST, DELETION];
        const mounted = mountDrawer();

        mounted.click('Reject');
        expect(chat.respond).not.toHaveBeenCalled();

        mounted.click('Approve');

        expect(chat.respond).toHaveBeenCalledWith([
            { approvalId: 'ap_1', action: 'reject' },
            { approvalId: 'ap_2', action: 'approve' },
        ] satisfies ApprovalDecision[]);
        mounted.unmount();
    });

    it('answers every undecided call at once', () => {
        chat.pending = [REQUEST, DELETION];
        const mounted = mountDrawer();

        mounted.click('Approve all');

        expect(chat.respond).toHaveBeenCalledWith([
            { approvalId: 'ap_1', action: 'approve' },
            { approvalId: 'ap_2', action: 'approve' },
        ] satisfies ApprovalDecision[]);
        mounted.unmount();
    });
});

describe('ChatDrawer transcript', () => {
    beforeEach(() => {
        chat = {
            entries: [],
            tail: '',
            isStreaming: false,
            isRestoring: false,
            pending: [],
            rejected: {},
            send: vi.fn(),
            respond: vi.fn(),
            stop: vi.fn(),
            newChat: vi.fn(),
        };
        closeDrawer();
        toggleDrawer();
    });

    it('says a call ran when nothing held it back', () => {
        chat.entries = [calling('toolu_1', 'entries_page_query')];
        const mounted = mountDrawer();

        expect(mounted.toolMarkers()).toEqual(['Ran entries_page_query']);
        mounted.unmount();
    });

    it('says a declined call was declined, not that it ran', () => {
        chat.entries = [calling('toolu_1', 'entries_page_update')];
        chat.rejected = { toolu_1: 'rejected' };
        const mounted = mountDrawer();

        expect(mounted.toolMarkers()).toEqual(['Declined entries_page_update']);
        mounted.unmount();
    });

    it('says a held call is waiting on the user, not that it ran', () => {
        chat.entries = [calling('toolu_1', 'entries_page_update')];
        chat.pending = [REQUEST];
        const mounted = mountDrawer();

        expect(mounted.toolMarkers()).toEqual([
            'Awaiting your approval for entries_page_update',
        ]);
        mounted.unmount();
    });
});

describe('ChatDrawer session', () => {
    beforeEach(() => {
        chat = {
            entries: [],
            tail: '',
            isStreaming: false,
            isRestoring: false,
            pending: [],
            rejected: {},
            send: vi.fn(),
            respond: vi.fn(),
            stop: vi.fn(),
            newChat: vi.fn(),
        };
        closeDrawer();
        toggleDrawer();
    });

    it('says so while the stored conversation is still being read', () => {
        chat.isRestoring = true;
        const mounted = mountDrawer();

        expect(mounted.hints()).toEqual(['Loading your conversation…']);
        mounted.unmount();
    });

    it('starts a new conversation from the header', () => {
        chat.entries = [calling('toolu_1', 'entries_page_query')];
        const mounted = mountDrawer();

        mounted.click('New chat');

        expect(chat.newChat).toHaveBeenCalled();
        mounted.unmount();
    });

    it('holds the control back while a turn is streaming', () => {
        chat.isStreaming = true;
        const mounted = mountDrawer();

        expect(mounted.button('New chat')?.disabled).toBe(true);
        mounted.unmount();
    });
});

type Mounted = {
    panel: () => HTMLElement | null;
    prompt: () => HTMLElement | null;
    messages: () => string[];
    toolMarkers: () => string[];
    hints: () => string[];
    button: (label: string) => HTMLButtonElement | undefined;
    click: (label: string) => void;
    rerender: () => void;
    unmount: () => void;
};

/** Mount the drawer against the mocked hook. */
function mountDrawer(): Mounted {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const render = (): void => {
        act(() => {
            root.render(<ChatDrawer />);
        });
    };
    render();

    const textOf = (selector: string): string[] =>
        [...host.querySelectorAll(selector)].map((element) => element.textContent ?? '');

    const buttonOf = (label: string): HTMLButtonElement | undefined =>
        [...host.querySelectorAll('button')].find(
            (candidate) => candidate.textContent === label
        );

    return {
        panel: () => host.querySelector<HTMLElement>('.am-assistant-approvals'),
        prompt: () => host.querySelector<HTMLElement>('.am-assistant-prompt'),
        rerender: render,
        messages: () => textOf('.am-assistant-approval-message'),
        toolMarkers: () => textOf('.am-assistant-tool'),
        hints: () => textOf('.am-assistant-hint'),
        button: buttonOf,
        click: (label) => {
            const button = buttonOf(label);
            if (button === undefined) throw new Error(`no "${label}" button`);
            act(() => {
                button.click();
            });
        },
        unmount: () => {
            act(() => {
                root.unmount();
            });
            host.remove();
        },
    };
}
