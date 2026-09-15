/**
 * Where the AI context message lands in a request. The API accepts a
 * mid-conversation `role: 'system'` message only after a user message, so the
 * context follows a user turn or a tool turn, which the provider converts to a
 * user message. With neither last, it rides in the system prompt instead.
 */

import type { ChatMessage } from '../../src/types';
import type { AiContextItem } from 'astromech';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { formatAiContextMessage } from 'astromech';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRequest, SYSTEM_PROMPT } from '../../src/loop/request';

// Only placement is under test, so the formatter returns a fixed marker.
vi.mock('astromech', () => ({
    formatAiContextMessage: vi.fn(),
}));

const CONTEXT = { role: 'system' as const, content: '<<context>>' };

const items: AiContextItem[] = [
    { reference: { kind: 'pages', label: 'Dashboard' }, depth: 0, order: 0 },
];

/** One turn of plain text, the shape the drawer sends for a typed message. */
function text(role: 'user' | 'assistant', value: string): ChatMessage {
    return { role, content: [{ type: 'text', text: value }] };
}

const conversation: ChatMessage[] = [
    text('user', 'first'),
    text('assistant', 'reply'),
    text('user', 'latest'),
];

beforeEach(() => {
    vi.mocked(formatAiContextMessage).mockReturnValue(CONTEXT);
});

describe('buildRequest', () => {
    it('appends the context after a lone user turn', () => {
        const { system, messages } = buildRequest([text('user', 'hi')], items);

        expect(messages).toEqual([text('user', 'hi'), CONTEXT]);
        expect(system).toBe(SYSTEM_PROMPT);
    });

    it('appends the context after the final user turn', () => {
        const { system, messages } = buildRequest(conversation, items);

        expect(messages).toHaveLength(4);
        expect(messages[2]).toEqual(text('user', 'latest'));
        expect(messages[3]).toEqual(CONTEXT);
        expect(system).toBe(SYSTEM_PROMPT);
    });

    /**
     * The API rejects a turn whose reasoning comes back altered or reordered
     * ahead of a tool call (a reasoning part's `providerOptions` carry its
     * signature), and a tool-call id cannot be minted client-side. So nothing
     * may be filtered, rewritten or resorted.
     */
    it('round-trips reasoning and tool-call parts unchanged and in order', () => {
        const blocks = [
            {
                type: 'reasoning' as const,
                text: '',
                providerOptions: { anthropic: { signature: 'sig-1' } },
            },
            { type: 'text' as const, text: 'Looking that up.' },
            {
                type: 'tool-call' as const,
                toolCallId: 'toolu_01ABC',
                toolName: 'entries_page_query',
                input: { limit: 5 },
            },
        ];
        const turn: ChatMessage = { role: 'assistant', content: blocks };

        const { messages } = buildRequest([text('user', 'find pages'), turn], items);

        expect(messages[1]?.content).toEqual(blocks);
        expect(messages[1]?.content).toBe(turn.content);
    });

    it('appends the context after a tool turn and leaves the system prompt alone', () => {
        const result: ChatMessage = {
            role: 'tool',
            content: [
                {
                    type: 'tool-result',
                    toolCallId: 'toolu_01ABC',
                    toolName: 'entries_page_query',
                    output: { type: 'text', value: '{"items":[]}' },
                },
            ],
        };

        const { system, messages } = buildRequest(
            [text('user', 'find pages'), result],
            items
        );

        expect(messages).toEqual([text('user', 'find pages'), result, CONTEXT]);
        expect(messages[1]).toBe(result);
        expect(system).toBe(SYSTEM_PROMPT);
    });

    it('leaves the prompt and turns alone when there is no context', () => {
        vi.mocked(formatAiContextMessage).mockReturnValue(null);

        const { system, messages } = buildRequest(conversation, []);

        expect(system).toBe(SYSTEM_PROMPT);
        expect(messages).toEqual(conversation);
    });

    it('falls back to the system prompt when an assistant turn is last', () => {
        const { system, messages } = buildRequest(
            [text('user', 'first'), text('assistant', 'reply')],
            items
        );

        expect(messages).toHaveLength(2);
        expect(messages.some((message) => message.role === 'system')).toBe(false);
        expect(system).toContain('<<context>>');
    });

    it('does not throw on an empty conversation', () => {
        const { system, messages } = buildRequest([], items);

        expect(messages).toEqual([]);
        expect(system).toContain('<<context>>');
    });
});

/**
 * Appending after a tool turn is valid only because of the provider's
 * conversion: it sends the tool turn as a user message of tool results and the
 * context as a mid-conversation system message after it, the same shape as
 * after a typed message. So the built request goes through the real provider
 * here, with `fetch` stubbed, rather than trusting the shape.
 */
describe('buildRequest through the Anthropic provider', () => {
    /** The two parts of the Messages API body these assertions read. */
    type MessagesBody = {
        system: unknown;
        messages: { role: string; content: unknown }[];
    };

    /** A minimal finished reply, so the call resolves. */
    const REPLY = {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-4-5',
        content: [{ type: 'text', text: 'Done.' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
    };

    it('after an approval, keeps the system prompt and sends the context after the tool results', async () => {
        let body: MessagesBody | undefined;
        const anthropic = createAnthropic({
            apiKey: 'test-key',
            fetch: async (_url, init) => {
                body = JSON.parse(String(init?.body));
                return new Response(JSON.stringify(REPLY), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            },
        });

        // The transcript as the loop holds it once an approved call has run.
        const approved: ChatMessage[] = [
            text('user', 'update home'),
            {
                role: 'assistant',
                content: [
                    {
                        type: 'tool-call',
                        toolCallId: 'toolu_1',
                        toolName: 'entries_page_update',
                        input: { id: 'page_1' },
                    },
                ],
            },
            {
                role: 'tool',
                content: [
                    {
                        type: 'tool-result',
                        toolCallId: 'toolu_1',
                        toolName: 'entries_page_update',
                        output: { type: 'text', value: '{"id":"page_1"}' },
                    },
                ],
            },
        ];
        const { system, messages } = buildRequest(approved, items);

        await generateText({
            model: anthropic('claude-opus-4-5'),
            system,
            messages,
            allowSystemInMessages: true,
            maxRetries: 0,
        });

        expect(body?.system).toEqual([expect.objectContaining({ text: SYSTEM_PROMPT })]);
        expect(body?.messages.slice(-2)).toEqual([
            {
                role: 'user',
                content: [
                    expect.objectContaining({
                        type: 'tool_result',
                        tool_use_id: 'toolu_1',
                    }),
                ],
            },
            {
                role: 'system',
                content: [expect.objectContaining({ type: 'text', text: '<<context>>' })],
            },
        ]);
    });
});
