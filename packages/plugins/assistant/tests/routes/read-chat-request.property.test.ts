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

/**
 * Any value at one of the request's keys: sometimes right, often not. An
 * `aiContext` is either well-formed or not an array; an array holding a
 * malformed item is the open defect at the end of this file.
 */
const nearMiss = fc.record(
    {
        messages: fc.oneof(
            fc.array(message),
            fc.array(fc.oneof(message, fc.jsonValue()), { maxLength: 3 }),
            fc.jsonValue()
        ),
        aiContext: fc.oneof(
            fc.array(aiContextItem),
            fc.jsonValue().filter((value) => !Array.isArray(value))
        ),
        decisions: fc.oneof(
            fc.array(fc.oneof(decision, fc.jsonValue()), { maxLength: 3 }),
            fc.jsonValue()
        ),
    },
    { requiredKeys: [] }
);

/** The request keys, so a generated unknown key cannot shadow one. */
const KNOWN_KEYS = new Set(['messages', 'aiContext', 'decisions']);

// The oracle below is written from the wire types, not from the reader:
// `ChatRequest` and `ApprovalDecision` in src/types.ts, the AI SDK's
// `UserModelMessage`, `AssistantModelMessage` and `ToolModelMessage`, and
// core's `AiContextItem`.

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
    return value === undefined || typeof value === 'string';
}

/** Content parts are a union discriminated by a string `type`. */
function isPartList(value: unknown): boolean {
    return (
        Array.isArray(value) &&
        value.every((part) => isRecord(part) && typeof part.type === 'string')
    );
}

/** User and assistant content may be a string or parts; tool content is parts only. */
const CONTENT_BY_ROLE: Record<string, (content: unknown) => boolean> = {
    user: (content) => typeof content === 'string' || isPartList(content),
    assistant: (content) => typeof content === 'string' || isPartList(content),
    tool: isPartList,
};

function isMessage(value: unknown): boolean {
    if (!isRecord(value) || typeof value.role !== 'string') return false;
    const contentFits = CONTENT_BY_ROLE[value.role];
    return contentFits !== undefined && contentFits(value.content);
}

const AI_CONTEXT_KINDS = ['entries', 'globals', 'media', 'users', 'pages'];

function isAiContextItem(value: unknown): boolean {
    if (!isRecord(value) || !isRecord(value.reference)) return false;
    const { kind, label, type, id } = value.reference;
    return (
        AI_CONTEXT_KINDS.includes(kind as string) &&
        typeof label === 'string' &&
        isOptionalString(type) &&
        isOptionalString(id) &&
        typeof value.depth === 'number' &&
        typeof value.order === 'number'
    );
}

function isDecision(value: unknown): boolean {
    return (
        isRecord(value) &&
        typeof value.approvalId === 'string' &&
        (value.action === 'approve' || value.action === 'reject')
    );
}

/** An optional array key: absent, or an array whose every item fits. */
function isOptionalListOf(value: unknown, fits: (item: unknown) => boolean): boolean {
    return value === undefined || (Array.isArray(value) && value.every(fits));
}

/** Is `value` a `ChatRequest`, with no keys the type does not name? */
function isChatRequest(value: unknown): boolean {
    if (!isRecord(value)) return false;
    if (Object.keys(value).some((key) => !KNOWN_KEYS.has(key))) return false;
    return (
        Array.isArray(value.messages) &&
        value.messages.every(isMessage) &&
        isOptionalListOf(value.aiContext, isAiContextItem) &&
        isOptionalListOf(value.decisions, isDecision)
    );
}

/** Does this body post an `aiContext` array holding an item of the wrong shape? */
function postsMalformedAiContextItem(text: string): boolean {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return false;
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.aiContext)) return false;
    return !parsed.aiContext.every(isAiContextItem);
}

describe('readChatRequest', () => {
    it('returns a ChatRequest or null for any body, and never throws', async () => {
        const body = fc.oneof(
            fc.string(),
            fc.jsonValue().map((value) => JSON.stringify(value)),
            nearMiss.map((value) => JSON.stringify(value))
        );
        await fc.assert(
            fc.asyncProperty(body, async (text) => {
                fc.pre(!postsMalformedAiContextItem(text));
                const result = await readChatRequest(post(text));
                expect(result === null || isChatRequest(result)).toBe(true);
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

    // The precondition for the open defect below: the reader returns a request
    // for this body today, so the failing case fails for the right reason.
    it('returns a request whose aiContext item has no reference', async () => {
        const body = JSON.stringify({
            messages: [{ role: 'user', content: 'hi' }],
            aiContext: [{ anything: 'at all' }],
        });

        await expect(readChatRequest(post(body))).resolves.toEqual({
            messages: [{ role: 'user', content: 'hi' }],
            aiContext: [{ anything: 'at all' }],
        });
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
