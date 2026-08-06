/**
 * Transport for the chat drawer: posts the transcript to the plugin's streaming
 * route and folds the server-sent events back into it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAIContextItems, useAstromechPlugin } from 'astromech/ui';
import { parseChatEvent, splitSseFrames } from './sse.js';
import { errorMessage } from '../error-message.js';
import type { ChatSession } from '../service/sessions.js';
import type {
    ApprovalDecision,
    ApprovalRequest,
    ChatEvent,
    ChatMessage,
} from '../types.js';

/**
 * One row of the transcript. An error is not a content block and must never
 * reach the model, so it sits alongside the turns rather than inside one.
 */
export type ChatEntry =
    | { kind: 'message'; message: ChatMessage }
    | { kind: 'error'; error: string };

/**
 * The calls the user turned down, by `toolCallId`. Interface state rather than
 * conversation: the model learns of a decline through the tool result it gets.
 */
export type RejectedCalls = Record<string, 'rejected'>;

export type UseChat = {
    entries: ChatEntry[];
    /** The in-flight assistant text; `''` whenever nothing is streaming. */
    tail: string;
    isStreaming: boolean;
    /** True until the stored conversation has been asked for and answered. */
    isRestoring: boolean;
    /** The calls waiting on a decision; `[]` when none are. */
    pending: ApprovalRequest[];
    rejected: RejectedCalls;
    send: (text: string) => void;
    /** Answer every held call and resume the turn they paused. */
    respond: (decisions: ApprovalDecision[]) => void;
    stop: () => void;
    /** Discard the conversation, on the server as well as here. */
    newChat: () => void;
};

/** The plugin's own JSON methods, as `useAstromechPlugin().service` exposes them. */
type SessionsService = {
    getSession: () => Promise<ChatSession>;
    clearSession: () => Promise<null>;
};

/**
 * A site can move the API mount, but the admin exposes no route base to plugin
 * components — only the plugin's own `/plugins/<serviceKey>` segment.
 */
const API_BASE_PATH = '/api';

/** Hold the transcript and drive one in-flight request against the chat route. */
export function useChat(): UseChat {
    const { serviceKey, service } = useAstromechPlugin();
    const [entries, setEntries] = useState<ChatEntry[]>([]);
    const [tail, setTail] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [isRestoring, setIsRestoring] = useState(true);
    const [pending, setPending] = useState<ApprovalRequest[]>([]);
    const [rejected, setRejected] = useState<RejectedCalls>({});
    const aiContext = useAIContextItems();
    const entriesRef = useRef<ChatEntry[]>([]);
    const pendingRef = useRef<ApprovalRequest[]>([]);
    const abortRef = useRef<AbortController | null>(null);
    // `astromechClient.plugins` is a Proxy that synthesises a fresh object per
    // access, so the binding is captured once rather than tracked as a dependency.
    const sessionsRef = useRef(service as SessionsService);

    // A request outlives the component that started it; unmount must cancel it.
    useEffect(() => () => abortRef.current?.abort(), []);

    const updateEntries = useCallback((next: ChatEntry[]) => {
        entriesRef.current = next;
        setEntries(next);
    }, []);

    const updatePending = useCallback((next: ApprovalRequest[]) => {
        pendingRef.current = next;
        setPending(next);
    }, []);

    // The server owns the transcript, so it is asked for once on mount. A load
    // that lost a race with the user's first message is dropped rather than
    // replacing what they have already started, and a failure starts empty.
    useEffect(() => {
        let live = true;
        void sessionsRef.current
            .getSession()
            .then((session) => {
                if (!live || entriesRef.current.length > 0) return;
                updateEntries(
                    session.messages.map((message) => ({ kind: 'message', message }))
                );
                updatePending(session.pending);
            })
            .catch(() => undefined)
            .finally(() => {
                if (live) setIsRestoring(false);
            });
        return () => {
            live = false;
        };
    }, [updateEntries, updatePending]);

    const decline = useCallback((requests: ApprovalRequest[]) => {
        if (requests.length === 0) return;
        setRejected((current) => {
            const next = { ...current };
            for (const request of requests) next[request.toolCallId] = 'rejected';
            return next;
        });
    }, []);

    const stop = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    const startTurn = useCallback(
        (next: ChatEntry[], decisions: ApprovalDecision[]) => {
            setTail('');
            const controller = new AbortController();
            abortRef.current = controller;
            setIsStreaming(true);

            void runStream({
                url: `${API_BASE_PATH}/plugins/${serviceKey}/chat`,
                body: {
                    messages: toMessages(next),
                    aiContext: [...aiContext],
                    decisions,
                },
                signal: controller.signal,
                onEvent: (event) => {
                    if (event.type === 'text-delta') {
                        setTail((current) => current + event.text);
                        return;
                    }
                    if (event.type === 'message') {
                        updateEntries([
                            ...entriesRef.current,
                            { kind: 'message', message: event.message },
                        ]);
                        setTail('');
                        return;
                    }
                    if (event.type === 'approval-required') {
                        updatePending(event.requests);
                        return;
                    }
                    if (event.type === 'error') {
                        updateEntries([
                            ...entriesRef.current,
                            { kind: 'error', error: event.error },
                        ]);
                        setTail('');
                    }
                },
            }).finally(() => {
                abortRef.current = null;
                setIsStreaming(false);
                // A stopped stream leaves a tail no `message` event ever closed.
                setTail('');
            });
        },
        [aiContext, serviceKey, updateEntries, updatePending]
    );

    const send = useCallback(
        (text: string) => {
            const asked = text.trim();
            if (asked === '' || abortRef.current !== null) return;

            // The server declines every held call the next message leaves
            // unanswered, so the transcript has to say the same about them.
            decline(pendingRef.current);
            updatePending([]);

            const next: ChatEntry[] = [
                ...entriesRef.current,
                {
                    kind: 'message',
                    message: { role: 'user', content: [{ type: 'text', text: asked }] },
                },
            ];
            updateEntries(next);
            startTurn(next, []);
        },
        [decline, startTurn, updateEntries, updatePending]
    );

    const respond = useCallback(
        (decisions: ApprovalDecision[]) => {
            const requests = pendingRef.current;
            if (requests.length === 0 || abortRef.current !== null) return;

            const turnedDown = new Set(
                decisions
                    .filter((decision) => decision.action === 'reject')
                    .map((decision) => decision.approvalId)
            );
            decline(requests.filter((request) => turnedDown.has(request.approvalId)));
            updatePending([]);
            // The transcript goes back exactly as it stands: the server builds
            // the tool message and streams it back as a `message` event.
            startTurn(entriesRef.current, decisions);
        },
        [decline, startTurn, updatePending]
    );

    const newChat = useCallback(() => {
        abortRef.current?.abort();
        updateEntries([]);
        updatePending([]);
        setRejected({});
        setTail('');
        // The server drops the stored conversation and turns down anything still
        // held, so a clear that failed has to be said out loud.
        void sessionsRef.current.clearSession().catch((error: unknown) => {
            updateEntries([{ kind: 'error', error: errorMessage(error) }]);
        });
    }, [updateEntries, updatePending]);

    return {
        entries,
        tail,
        isStreaming,
        isRestoring,
        pending,
        rejected,
        send,
        respond,
        stop,
        newChat,
    };
}

/** The wire shape: the turns only, since an error was never part of the conversation. */
function toMessages(entries: ChatEntry[]): ChatMessage[] {
    return entries.flatMap((entry) => (entry.kind === 'message' ? [entry.message] : []));
}

/** POST the turn and feed every parsed event to `onEvent`. Never throws. */
async function runStream(input: {
    url: string;
    body: unknown;
    signal: AbortSignal;
    onEvent: (event: ChatEvent) => void;
}): Promise<void> {
    try {
        const response = await fetch(input.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input.body),
            signal: input.signal,
        });
        if (!response.ok) {
            input.onEvent({ type: 'error', error: await readErrorMessage(response) });
            return;
        }
        if (response.body === null) {
            input.onEvent({
                type: 'error',
                error: 'The assistant returned no response body.',
            });
            return;
        }
        await readEvents(response.body, input.onEvent);
    } catch (error) {
        // An abort is the stop button or an unmount, not a failure to report.
        if (error instanceof Error && error.name === 'AbortError') return;
        input.onEvent({ type: 'error', error: errorMessage(error) });
    }
}

/** Read the stream frame by frame, carrying a partial frame between reads. */
async function readEvents(
    body: ReadableStream<Uint8Array>,
    onEvent: (event: ChatEvent) => void
): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { frames, rest } = splitSseFrames(buffer);
        buffer = rest;
        for (const frame of frames) emitFrame(frame, onEvent);
    }

    // A stream cut short can leave a frame without its delimiter; parsing it
    // yields null rather than throwing.
    emitFrame(buffer + decoder.decode(), onEvent);
}

/** Parse one frame and forward it, ignoring anything that is not a chat event. */
function emitFrame(frame: string, onEvent: (event: ChatEvent) => void): void {
    const event = parseChatEvent(frame);
    if (event !== null) onEvent(event);
}

/**
 * The route answers 503 with `{ error }` when no API key is configured and 400
 * on a malformed body; that string is the one an operator needs.
 */
async function readErrorMessage(response: Response): Promise<string> {
    try {
        const body: unknown = await response.json();
        if (typeof body === 'object' && body !== null) {
            const { error } = body as { error?: unknown };
            if (typeof error === 'string' && error !== '') return error;
        }
    } catch {
        return `The assistant request failed (${String(response.status)}).`;
    }
    return `The assistant request failed (${String(response.status)}).`;
}
