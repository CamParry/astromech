/**
 * Transport for the chat drawer: posts a turn to the plugin's streaming route
 * and folds the server-sent events back into a transcript.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAIContextEntries } from 'astromech/ui';
import { parseChatEvent, splitSseFrames } from './sse.js';
import type { ChatEvent, ChatMessage } from '../../types.js';

/** One piece of a turn, in the order it arrived. */
export type ChatPart =
    | { kind: 'text'; text: string }
    | { kind: 'tool'; name: string }
    | { kind: 'error'; message: string };

/** One side of the conversation as the drawer renders it. */
export type ChatTurn = { role: 'user' | 'assistant'; parts: ChatPart[] };

export type UseChat = {
    turns: ChatTurn[];
    isStreaming: boolean;
    send: (text: string) => void;
    stop: () => void;
};

/**
 * A site can move the API mount, but the admin exposes no route base to plugin
 * components — only the plugin's own `/plugins/<serviceKey>` segment.
 */
const API_ROUTE = '/api';

/** Hold the transcript and drive one in-flight request against the chat route. */
export function useChat(serviceKey: string): UseChat {
    const [turns, setTurns] = useState<ChatTurn[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const aiContext = useAIContextEntries();
    const turnsRef = useRef<ChatTurn[]>([]);
    const abortRef = useRef<AbortController | null>(null);

    // A request outlives the component that started it; unmount must cancel it.
    useEffect(() => () => abortRef.current?.abort(), []);

    const commit = useCallback((next: ChatTurn[]) => {
        turnsRef.current = next;
        setTurns(next);
    }, []);

    const stop = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    const send = useCallback(
        (text: string) => {
            const content = text.trim();
            if (content === '' || abortRef.current !== null) return;

            const asked: ChatTurn = {
                role: 'user',
                parts: [{ kind: 'text', text: content }],
            };
            const messages = toChatMessages([...turnsRef.current, asked]);
            commit([...turnsRef.current, asked, { role: 'assistant', parts: [] }]);

            const controller = new AbortController();
            abortRef.current = controller;
            setIsStreaming(true);

            void runStream({
                url: `${API_ROUTE}/plugins/${serviceKey}/chat`,
                body: { messages, aiContext: [...aiContext] },
                signal: controller.signal,
                onEvent: (event) => {
                    commit(applyEvent(turnsRef.current, event));
                },
            }).finally(() => {
                abortRef.current = null;
                setIsStreaming(false);
            });
        },
        [aiContext, commit, serviceKey]
    );

    return { turns, isStreaming, send, stop };
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
            input.onEvent({ type: 'error', message: await readErrorMessage(response) });
            return;
        }
        if (response.body === null) {
            input.onEvent({
                type: 'error',
                message: 'The assistant returned no response body.',
            });
            return;
        }
        await readEvents(response.body, input.onEvent);
    } catch (error) {
        // An abort is the stop button or an unmount, not a failure to report.
        if (error instanceof Error && error.name === 'AbortError') return;
        input.onEvent({ type: 'error', message: describeError(error) });
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

/** Append an event to the assistant turn that is currently streaming. */
function applyEvent(turns: ChatTurn[], event: ChatEvent): ChatTurn[] {
    if (event.type === 'done') return turns;
    const last = turns[turns.length - 1];
    if (last === undefined || last.role !== 'assistant') return turns;
    return [
        ...turns.slice(0, -1),
        { role: 'assistant', parts: appendPart(last.parts, event) },
    ];
}

/** Grow the trailing text part for a text event; a tool or error starts a new one. */
function appendPart(
    parts: ChatPart[],
    event: Exclude<ChatEvent, { type: 'done' }>
): ChatPart[] {
    if (event.type === 'tool') return [...parts, { kind: 'tool', name: event.name }];
    if (event.type === 'error')
        return [...parts, { kind: 'error', message: event.message }];

    const last = parts[parts.length - 1];
    if (last !== undefined && last.kind === 'text') {
        return [...parts.slice(0, -1), { kind: 'text', text: last.text + event.text }];
    }
    return [...parts, { kind: 'text', text: event.text }];
}

/** The wire shape: each turn's text joined, dropping turns that said nothing. */
function toChatMessages(turns: ChatTurn[]): ChatMessage[] {
    return turns
        .map((turn) => ({
            role: turn.role,
            content: turn.parts
                .filter(isTextPart)
                .map((part) => part.text)
                .join(''),
        }))
        .filter((message) => message.content !== '');
}

/** Narrowing predicate so `filter` keeps the text part's `text` field. */
function isTextPart(part: ChatPart): part is Extract<ChatPart, { kind: 'text' }> {
    return part.kind === 'text';
}

/** The message of a thrown value, and nothing else about it. */
function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
