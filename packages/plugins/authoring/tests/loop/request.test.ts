/**
 * Where the AI context message lands in a request. The API rejects a
 * `role: 'system'` message at `messages[0]`, so a first turn in a fresh chat
 * must carry the context in the system prompt instead.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Only placement is under test, so the formatter returns a fixed marker.
vi.mock('astromech', () => ({
    formatAIContextMessage: vi.fn(),
}));

import { formatAIContextMessage } from 'astromech';
import type { AIContextEntry } from 'astromech';
import { buildRequest, SYSTEM_PROMPT } from '../../src/loop/request.js';
import type { ChatMessage } from '../../src/types.js';

const CONTEXT = { role: 'system' as const, content: '<<context>>' };

const entries: AIContextEntry[] = [
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
    it('puts the context in the system prompt on a single user turn', () => {
        const { system, messages } = buildRequest(
            [{ role: 'user', content: 'hi' }],
            entries
        );

        expect(messages).toHaveLength(1);
        expect(messages[0]?.role).toBe('user');
        expect(system).toContain('<<context>>');
        expect(system.startsWith(SYSTEM_PROMPT)).toBe(true);
    });

    it('splices the context immediately before the final user turn', () => {
        const { system, messages } = buildRequest(conversation, entries);

        expect(messages).toHaveLength(4);
        expect(messages[2]).toEqual(CONTEXT);
        expect(messages[3]).toEqual({ role: 'user', content: 'latest' });
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
            entries
        );

        expect(messages).toHaveLength(2);
        expect(messages.some((message) => message.role === 'system')).toBe(false);
        expect(system).toContain('<<context>>');
    });

    it('does not throw on an empty conversation', () => {
        const { system, messages } = buildRequest([], entries);

        expect(messages).toEqual([]);
        expect(system).toContain('<<context>>');
    });
});
