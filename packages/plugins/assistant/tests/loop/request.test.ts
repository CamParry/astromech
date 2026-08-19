/**
 * Where the AI context message lands in a request. The API requires a
 * `role: 'system'` message to follow a user turn and to be last or followed by
 * an assistant turn, so with no user turn to follow it rides in the system
 * prompt instead.
 */

import type { ChatMessage } from '../../src/types';
import type { AiContextItem } from 'astromech';
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
     * The API rejects a turn whose `thinking` blocks come back altered or
     * reordered ahead of a `tool_use`, and a `tool_use` id cannot be minted
     * client-side — so nothing may be filtered, rewritten or resorted.
     */
    it('round-trips thinking and tool_use blocks unchanged and in order', () => {
        const blocks = [
            { type: 'thinking' as const, thinking: '', signature: 'sig-1' },
            { type: 'text' as const, text: 'Looking that up.' },
            {
                type: 'tool_use' as const,
                id: 'toolu_01ABC',
                name: 'entries_page_query',
                input: { limit: 5 },
            },
        ];
        const turn: ChatMessage = { role: 'assistant', content: blocks };

        const { messages } = buildRequest([text('user', 'find pages'), turn], items);

        expect(messages[1]?.content).toEqual(blocks);
        expect(messages[1]?.content).toBe(turn.content);
    });

    it('carries a user turn of tool_result blocks through untouched', () => {
        const result: ChatMessage = {
            role: 'user',
            content: [
                {
                    type: 'tool_result',
                    tool_use_id: 'toolu_01ABC',
                    content: '{"items":[]}',
                },
            ],
        };

        const { messages } = buildRequest([text('user', 'find pages'), result], items);

        expect(messages[1]).toEqual(result);
        // Still a user turn, so the context message follows it.
        expect(messages[2]).toEqual(CONTEXT);
    });

    it('leaves the prompt and turns alone when there is no context', () => {
        vi.mocked(formatAiContextMessage).mockReturnValue(null);

        const { system, messages } = buildRequest(conversation, []);

        expect(system).toBe(SYSTEM_PROMPT);
        expect(messages).toEqual(conversation);
    });

    it('falls back to the system prompt when the last turn is not a user turn', () => {
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
