/**
 * @vitest-environment happy-dom
 *
 * The drawer's transport, around the approval gate: what an `approval-required`
 * event leaves behind, what `respond` posts, and what a new message does to the
 * calls still held.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useChat } from '../../src/admin/use-chat.js';
import type { UseChat } from '../../src/admin/use-chat.js';
import type { ChatSession } from '../../src/service/sessions.js';
import type { ApprovalRequest, ChatEvent, ChatMessage } from '../../src/types.js';

const { sessionsService } = vi.hoisted(() => ({
    sessionsService: {
        getSession: vi.fn(
            async (): Promise<ChatSession> => ({ messages: [], pending: [] })
        ),
        clearSession: vi.fn(async (): Promise<null> => null),
    },
}));

vi.mock('astromech/ui', () => ({
    useAIContextItems: () => [],
    useAstromechPlugin: () => ({ serviceKey: 'authoring', service: sessionsService }),
}));

// `act` only batches and flushes once React is told it is under test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REQUEST: ApprovalRequest = {
    approvalId: 'ap_1',
    toolUseId: 'toolu_1',
    method: 'entries.page.update',
    toolName: 'entries_page_update',
    message: 'Update the page "Home"?',
    destructive: false,
    arguments: { id: 'page_1' },
};

/** The paused assistant turn the server streams back before it asks. */
const PAUSED_TURN: ChatMessage = {
    role: 'assistant',
    content: [
        { type: 'text', text: 'I can do that.' },
        {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'entries_page_update',
            input: { id: 'page_1' },
        },
    ],
};

const HELD = [
    { type: 'message', message: PAUSED_TURN },
    { type: 'approval-required', requests: [REQUEST] },
    { type: 'done' },
] satisfies ChatEvent[];

let fetchMock: ReturnType<typeof vi.fn>;

describe('useChat approvals', () => {
    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('surfaces the held calls an approval-required event carries', async () => {
        answerWith(HELD);
        const mounted = mountChat();

        await drain(() => {
            mounted.chat().send('update home');
        });

        expect(mounted.chat().pending).toEqual([REQUEST]);
        expect(mounted.chat().isStreaming).toBe(false);
        expect(mounted.chat().rejected).toEqual({});
        mounted.unmount();
    });

    it('posts the transcript as it stands, with the decisions', async () => {
        answerWith(HELD);
        const mounted = mountChat();
        await drain(() => {
            mounted.chat().send('update home');
        });

        answerWith([{ type: 'done' }]);
        await drain(() => {
            mounted.chat().respond([{ approvalId: 'ap_1', action: 'approve' }]);
        });

        expect(lastBody()).toEqual({
            messages: [
                { role: 'user', content: [{ type: 'text', text: 'update home' }] },
                PAUSED_TURN,
            ],
            aiContext: [],
            decisions: [{ approvalId: 'ap_1', action: 'approve' }],
        });
        expect(mounted.chat().pending).toEqual([]);
        mounted.unmount();
    });

    it('records a rejected call so the transcript can say so', async () => {
        answerWith(HELD);
        const mounted = mountChat();
        await drain(() => {
            mounted.chat().send('update home');
        });

        answerWith([{ type: 'done' }]);
        await drain(() => {
            mounted.chat().respond([{ approvalId: 'ap_1', action: 'reject' }]);
        });

        expect(mounted.chat().rejected).toEqual({ toolu_1: 'rejected' });
        mounted.unmount();
    });

    it('declines the held calls when the user sends a new message instead', async () => {
        answerWith(HELD);
        const mounted = mountChat();
        await drain(() => {
            mounted.chat().send('update home');
        });

        answerWith([{ type: 'done' }]);
        await drain(() => {
            mounted.chat().send('never mind, list them');
        });

        expect(mounted.chat().pending).toEqual([]);
        expect(mounted.chat().rejected).toEqual({ toolu_1: 'rejected' });
        // The decline is the server's to synthesise; nothing answers it here.
        expect(lastBody()).toEqual({
            messages: [
                { role: 'user', content: [{ type: 'text', text: 'update home' }] },
                PAUSED_TURN,
                {
                    role: 'user',
                    content: [{ type: 'text', text: 'never mind, list them' }],
                },
            ],
            aiContext: [],
            decisions: [],
        });
        mounted.unmount();
    });
});

describe('useChat session', () => {
    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        sessionsService.getSession.mockClear();
        sessionsService.clearSession.mockClear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('restores the stored transcript and the calls still held', async () => {
        sessionsService.getSession.mockResolvedValueOnce({
            messages: [PAUSED_TURN],
            pending: [REQUEST],
        });
        const mounted = mountChat();

        await settle();

        expect(mounted.chat().entries).toEqual([
            { kind: 'message', message: PAUSED_TURN },
        ]);
        expect(mounted.chat().pending).toEqual([REQUEST]);
        expect(mounted.chat().isRestoring).toBe(false);
        mounted.unmount();
    });

    it('starts empty when the stored session cannot be read', async () => {
        sessionsService.getSession.mockRejectedValueOnce(new Error('offline'));
        const mounted = mountChat();

        await settle();

        expect(mounted.chat().entries).toEqual([]);
        expect(mounted.chat().isRestoring).toBe(false);
        mounted.unmount();
    });

    it('leaves a message sent before the restore landed alone', async () => {
        let land: (session: ChatSession) => void = () => undefined;
        sessionsService.getSession.mockReturnValueOnce(
            new Promise<ChatSession>((resolve) => {
                land = resolve;
            })
        );
        answerWith([{ type: 'done' }]);
        const mounted = mountChat();

        await drain(() => {
            mounted.chat().send('update home');
            land({ messages: [PAUSED_TURN], pending: [REQUEST] });
        });

        expect(mounted.chat().entries).toEqual([
            {
                kind: 'message',
                message: {
                    role: 'user',
                    content: [{ type: 'text', text: 'update home' }],
                },
            },
        ]);
        expect(mounted.chat().pending).toEqual([]);
        mounted.unmount();
    });

    it('drops the conversation on both sides when a new one starts', async () => {
        sessionsService.getSession.mockResolvedValueOnce({
            messages: [PAUSED_TURN],
            pending: [REQUEST],
        });
        const mounted = mountChat();
        await settle();

        await drain(() => {
            mounted.chat().newChat();
        });

        expect(sessionsService.clearSession).toHaveBeenCalled();
        expect(mounted.chat().entries).toEqual([]);
        expect(mounted.chat().pending).toEqual([]);
        mounted.unmount();
    });
});

type Mounted = { chat: () => UseChat; unmount: () => void };

/** Mount a component that does nothing but hold the hook. */
function mountChat(): Mounted {
    let latest: UseChat | null = null;

    function Probe(): null {
        latest = useChat();
        return null;
    }

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
        root.render(<Probe />);
    });

    return {
        chat: () => {
            if (latest === null) throw new Error('the hook never rendered');
            return latest;
        },
        unmount: () => {
            act(() => {
                root.unmount();
            });
            host.remove();
        },
    };
}

/** Run `action`, then let the stream it starts drain before asserting. */
async function drain(action: () => void): Promise<void> {
    await act(async () => {
        action();
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

/** Let the mount's session request land before asserting. */
async function settle(): Promise<void> {
    await drain(() => undefined);
}

/** Make the next request answer with these events, one SSE frame each. */
function answerWith(events: ChatEvent[]): void {
    fetchMock.mockResolvedValueOnce({ ok: true, body: streamOf(events) });
}

/** The events as the byte stream `runStream` reads. */
function streamOf(events: ChatEvent[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
        start(controller) {
            for (const event of events) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            }
            controller.close();
        },
    });
}

/** The body of the most recent request, parsed. */
function lastBody(): unknown {
    const call: unknown = fetchMock.mock.calls.at(-1);
    const [, init] = call as [string, { body: string }];
    return JSON.parse(init.body);
}
