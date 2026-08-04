/**
 * Transport for the chat drawer: posts the transcript to the plugin's streaming
 * route and folds the server-sent events back into it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAIContextItems } from 'astromech/ui';
import { parseChatEvent, splitSseFrames } from './sse.js';
import { errorMessage } from '../error-message.js';
import type { ChatEvent, ChatMessage } from '../types.js';

/**
 * One row of the transcript. An error is not a content block and must never
 * reach the model, so it sits alongside the turns rather than inside one.
 */
export type ChatEntry =
    | { kind: 'message'; message: ChatMessage }
    | { kind: 'error'; error: string };

export type UseChat = {
    entries: ChatEntry[];
    /** The in-flight assistant text; `''` whenever nothing is streaming. */
    tail: string;
    isStreaming: boolean;
    send: (text: string) => void;
    stop: () => void;
};

/**
 * A site can move the API mount, but the admin exposes no route base to plugin
 * components — only the plugin's own `/plugins/<serviceKey>` segment.
 */
const API_BASE_PATH = '/api';

/** Hold the transcript and drive one in-flight request against the chat route. */
export function useChat(serviceKey: string): UseChat {
    const [entries, setEntries] = useState<ChatEntry[]>([]);
    const [tail, setTail] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const aiContext = useAIContextItems();
    const entriesRef = useRef<ChatEntry[]>([]);
    const abortRef = useRef<AbortController | null>(null);

    // A request outlives the component that started it; unmount must cancel it.
    useEffect(() => () => abortRef.current?.abort(), []);

    const updateEntries = useCallback((next: ChatEntry[]) => {
        entriesRef.current = next;
        setEntries(next);
    }, []);

    const stop = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    const send = useCallback(
        (text: string) => {
            const asked = text.trim();
            if (asked === '' || abortRef.current !== null) return;

            const next: ChatEntry[] = [
                ...entriesRef.current,
                {
                    kind: 'message',
                    message: { role: 'user', content: [{ type: 'text', text: asked }] },
                },
            ];
            updateEntries(next);
            setTail('');

            const controller = new AbortController();
            abortRef.current = controller;
            setIsStreaming(true);

            void runStream({
                url: `${API_BASE_PATH}/plugins/${serviceKey}/chat`,
                body: { messages: toMessages(next), aiContext: [...aiContext] },
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
        [aiContext, updateEntries, serviceKey]
    );

    return { entries, tail, isStreaming, send, stop };
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
