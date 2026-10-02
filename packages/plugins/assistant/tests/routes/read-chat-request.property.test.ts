/**
 * `readChatRequest` over generated bodies. It reads whatever a browser posts,
 * so for any body it either returns a chat request the loop can run or null
 * (the route answers null with a 400), and it never throws. A body the drawer
 * could send is read back unchanged, and keys it does not know are dropped.
 */

import { formatAiContextMessage } from 'astromech';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { readChatRequest } from '../../src/routes/chat';

/** A POST carrying `body` verbatim, so malformed JSON stays malformed. */
function post(body: string): Request {
    return new Request('http://localhost/api/plugins/assistant/chat', {
        method: 'POST',
        body,
    });
}

const jsonObject = fc.dictionary(fc.string(), fc.jsonValue(), { maxKeys: 4 });

/** A content part: a string `type`, plus whatever else the part carries. */
const contentPart = fc
    .tuple(fc.string(), jsonObject)
    .map(([type, rest]) => ({ ...rest, type }));

const message = fc.oneof(
    fc.record({ role: fc.constant('user'), content: fc.string() }),
    fc.record({
        role: fc.constantFrom('user', 'assistant', 'tool'),
        content: fc.array(contentPart, { maxLength: 3 }),
    })
);

const aiContextItem = fc.record({
    reference: fc.record(
        {
            kind: fc.constantFrom('entries', 'globals', 'media', 'users', 'pages'),
            type: fc.string(),
            id: fc.string(),
            label: fc.string(),
        },
        { requiredKeys: ['kind', 'label'] }
    ),
    depth: fc.integer(),
    order: fc.integer(),
});

const decision = fc.record({
    approvalId: fc.string(),
    action: fc.constantFrom('approve', 'reject'),
});

/** A body the admin's chat drawer could send. */
const chatRequest = fc.record(
    {
        messages: fc.array(message, { maxLength: 4 }),
        aiContext: fc.array(aiContextItem, { maxLength: 3 }),
        decisions: fc.array(decision, { maxLength: 3 }),
    },
    { requiredKeys: ['messages'] }
);

/** Any value at one of the request's keys: sometimes right, often not. */
const nearMiss = fc.record(
    {
        messages: fc.oneof(
            fc.array(message),
            fc.array(fc.oneof(message, fc.jsonValue()), { maxLength: 3 }),
            fc.jsonValue()
        ),
        aiContext: fc.oneof(fc.array(aiContextItem), fc.jsonValue()),
        decisions: fc.oneof(
            fc.array(fc.oneof(decision, fc.jsonValue()), { maxLength: 3 }),
            fc.jsonValue()
        ),
    },
    { requiredKeys: [] }
);

/** The request keys, so a generated unknown key cannot shadow one. */
const KNOWN_KEYS = new Set(['messages', 'aiContext', 'decisions']);

/** Does `value` have the shape the route's type promises the loop? */
function isWellFormed(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return false;
    const { messages, aiContext, decisions, ...rest } = value as Record<string, unknown>;
    if (Object.keys(rest).length > 0) return false;
    if (!Array.isArray(messages)) return false;
    const messagesOk = messages.every((turn: { role?: unknown; content?: unknown }) => {
        if (turn.role === 'user' && typeof turn.content === 'string') return true;
        if (!['user', 'assistant', 'tool'].includes(turn.role as string)) return false;
        return (
            Array.isArray(turn.content) &&
            turn.content.every(
                (part: unknown) =>
                    typeof part === 'object' &&
                    part !== null &&
                    typeof (part as { type?: unknown }).type === 'string'
            )
        );
    });
    const decisionsOk =
        decisions === undefined ||
        (Array.isArray(decisions) &&
            decisions.every(
                (answer: { approvalId?: unknown; action?: unknown }) =>
                    typeof answer === 'object' &&
                    answer !== null &&
                    typeof answer.approvalId === 'string' &&
                    (answer.action === 'approve' || answer.action === 'reject')
            ));
    return (
        messagesOk && decisionsOk && (aiContext === undefined || Array.isArray(aiContext))
    );
}

describe('readChatRequest', () => {
    it('returns a well-formed request or null for any body, and never throws', async () => {
        const body = fc.oneof(
            fc.string(),
            fc.jsonValue().map((value) => JSON.stringify(value)),
            nearMiss.map((value) => JSON.stringify(value))
        );
        await fc.assert(
            fc.asyncProperty(body, async (text) => {
                const result = await readChatRequest(post(text));
                expect(result === null || isWellFormed(result)).toBe(true);
            }),
            { numRuns: 300 }
        );
    });

    it('reads back any request the drawer could send', async () => {
        await fc.assert(
            fc.asyncProperty(chatRequest, async (request) => {
                await expect(
                    readChatRequest(post(JSON.stringify(request)))
                ).resolves.toEqual(request);
            })
        );
    });

    it('ignores keys it does not know', async () => {
        const unknownKeys = fc.dictionary(
            fc.string().filter((key) => !KNOWN_KEYS.has(key)),
            fc.jsonValue(),
            { minKeys: 1, maxKeys: 4 }
        );
        await fc.assert(
            fc.asyncProperty(chatRequest, unknownKeys, async (request, extra) => {
                await expect(
                    readChatRequest(post(JSON.stringify({ ...extra, ...request })))
                ).resolves.toEqual(request);
            })
        );
    });

    // Found by asking whether every accepted aiContext can be rendered: only
    // `Array.isArray` is checked, so an item without a `reference` is accepted
    // and `formatAiContextMessage` then throws a TypeError inside the loop.
    // The existing case 'parses an aiContext of arbitrary objects' in
    // chat.test.ts asserts the acceptance. Kept failing until it is decided.
    it.fails('accepts only an aiContext the loop can render', async () => {
        const body = JSON.stringify({
            messages: [{ role: 'user', content: 'hi' }],
            aiContext: [{ anything: 'at all' }],
        });

        const result = await readChatRequest(post(body));

        expect(() => formatAiContextMessage(result?.aiContext ?? [])).not.toThrow();
    });
});
