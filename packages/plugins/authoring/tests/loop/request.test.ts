/**
 * Where the AI context message lands in a request. The API requires a
 * `role: 'system'` message to follow a user turn and to be last or followed by
 * an assistant turn, so with no user turn to follow it rides in the system
 * prompt instead.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Only placement is under test, so the formatter returns a fixed marker.
vi.mock('astromech', () => ({
    formatAIContextMessage: vi.fn(),
}));

import { formatAIContextMessage } from 'astromech';
import type { AIContextItem } from 'astromech';
import { buildRequest, SYSTEM_PROMPT } from '../../src/loop/request.js';
import type { ChatMessage } from '../../src/types.js';

const CONTEXT = { role: 'system' as const, content: '<<context>>' };

const items: AIContextItem[] = [
    { reference: { kind: 'pages', label: 'Dashboard' }, depth: 0, order: 0 },
];

const conversation: ChatMessage[] = [
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'reply' },
    { role: 'user', content: 'latest' },
];

beforeEach(() => {
    vi.mocked(formatAIContextMessage).mockReturnValue(CONTEXT);
});

describe('buildRequest', () => {
    it('appends the context after a lone user turn', () => {
        const { system, messages } = buildRequest(
            [{ role: 'user', content: 'hi' }],
            items
        );

        expect(messages).toEqual([{ role: 'user', content: 'hi' }, CONTEXT]);
        expect(system).toBe(SYSTEM_PROMPT);
    });

    it('appends the context after the final user turn', () => {
        const { system, messages } = buildRequest(conversation, items);

        expect(messages).toHaveLength(4);
        expect(messages[2]).toEqual({ role: 'user', content: 'latest' });
        expect(messages[3]).toEqual(CONTEXT);
        expect(system).toBe(SYSTEM_PROMPT);
    });

    it('leaves the prompt and turns alone when there is no context', () => {
        vi.mocked(formatAIContextMessage).mockReturnValue(null);

        const { system, messages } = buildRequest(conversation, []);

        expect(system).toBe(SYSTEM_PROMPT);
        expect(messages).toEqual(conversation);
    });

    it('falls back to the system prompt when the last turn is not a user turn', () => {
        const { system, messages } = buildRequest(
            [
                { role: 'user', content: 'first' },
                { role: 'assistant', content: 'reply' },
            ],
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
