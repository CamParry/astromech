/**
 * Body validation on the chat route. Content blocks are checked for a `type`
 * and nothing more — deeper checks would reject the block types the transcript
 * deliberately carries through, and the API is the real validator.
 */

import { describe, expect, it } from 'vitest';

import { readChatRequest } from '../../src/routes/chat.js';

/** A POST carrying `body` verbatim, so malformed JSON stays malformed. */
function post(body: string): Request {
    return new Request('http://localhost/api/plugins/assistant/chat', {
        method: 'POST',
        body,
    });
}

/** A POST carrying `body` as JSON. */
function postJson(body: unknown): Request {
    return post(JSON.stringify(body));
}

/** One turn of plain text, the shape the drawer sends for a typed message. */
function text(role: 'user' | 'assistant', value: string): unknown {
    return { role, content: [{ type: 'text', text: value }] };
}

describe('readChatRequest', () => {
    it('parses a body of turns with no aiContext', async () => {
        const messages = [text('user', 'hi'), text('assistant', 'hello')];

        await expect(readChatRequest(postJson({ messages }))).resolves.toEqual({
            messages,
        });
    });

    it('parses a turn carrying blocks it does not model', async () => {
        const messages = [
            text('user', 'find pages'),
            {
                role: 'assistant',
                content: [
                    { type: 'thinking', thinking: '', signature: 'sig-1' },
                    {
                        type: 'tool_use',
                        id: 'toolu_01ABC',
                        name: 'entries_page_query',
                        input: { limit: 5 },
                    },
                ],
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'tool_result',
                        tool_use_id: 'toolu_01ABC',
                        content: '{"items":[]}',
                    },
                ],
            },
        ];

        await expect(readChatRequest(postJson({ messages }))).resolves.toEqual({
            messages,
        });
    });

    it('parses an aiContext of arbitrary objects', async () => {
        const messages = [text('user', 'hi')];
        const aiContext = [{ anything: 'at all' }, { depth: 2 }];

        await expect(readChatRequest(postJson({ messages, aiContext }))).resolves.toEqual(
            { messages, aiContext }
        );
    });

    it('rejects malformed JSON', async () => {
        await expect(readChatRequest(post('{ not json'))).resolves.toBeNull();
    });

    it('rejects a body that is not an object', async () => {
        await expect(readChatRequest(postJson('a string'))).resolves.toBeNull();
    });

    it('rejects missing messages', async () => {
        await expect(readChatRequest(postJson({}))).resolves.toBeNull();
    });

    it('rejects messages that are not an array', async () => {
        await expect(
            readChatRequest(postJson({ messages: text('user', 'hi') }))
        ).resolves.toBeNull();
    });

    it('rejects a turn with an unknown role', async () => {
        await expect(
            readChatRequest(
                postJson({
                    messages: [
                        { role: 'system', content: [{ type: 'text', text: 'hi' }] },
                    ],
                })
            )
        ).resolves.toBeNull();
    });

    it('accepts a user turn whose content is a bare string', async () => {
        const messages = [{ role: 'user', content: 'hi' }];

        await expect(readChatRequest(postJson({ messages }))).resolves.toEqual({
            messages,
        });
    });

    it('rejects a turn whose content is a string on a role that must array it', async () => {
        await expect(
            readChatRequest(
                postJson({ messages: [{ role: 'assistant', content: 'hi' }] })
            )
        ).resolves.toBeNull();
    });

    it('rejects a block that is not an object', async () => {
        await expect(
            readChatRequest(postJson({ messages: [{ role: 'user', content: ['hi'] }] }))
        ).resolves.toBeNull();
    });

    it('rejects a block with no type', async () => {
        await expect(
            readChatRequest(
                postJson({ messages: [{ role: 'user', content: [{ text: 'hi' }] }] })
            )
        ).resolves.toBeNull();
    });

    it('parses answers to a paused turn', async () => {
        const messages = [text('user', 'publish it')];
        const decisions = [{ approvalId: 'ap_1', action: 'approve' }];

        await expect(readChatRequest(postJson({ messages, decisions }))).resolves.toEqual(
            { messages, decisions }
        );
    });

    it('rejects decisions that are not an array', async () => {
        await expect(
            readChatRequest(
                postJson({
                    messages: [text('user', 'hi')],
                    decisions: { approvalId: 'ap_1', action: 'approve' },
                })
            )
        ).resolves.toBeNull();
    });

    it('rejects a decision with an unknown action', async () => {
        await expect(
            readChatRequest(
                postJson({
                    messages: [text('user', 'hi')],
                    decisions: [{ approvalId: 'ap_1', action: 'accept' }],
                })
            )
        ).resolves.toBeNull();
    });

    it('rejects a decision with no approvalId', async () => {
        await expect(
            readChatRequest(
                postJson({
                    messages: [text('user', 'hi')],
                    decisions: [{ action: 'approve' }],
                })
            )
        ).resolves.toBeNull();
    });

    it('rejects an aiContext that is not an array', async () => {
        await expect(
            readChatRequest(
                postJson({
                    messages: [text('user', 'hi')],
                    aiContext: { kind: 'pages' },
                })
            )
        ).resolves.toBeNull();
    });
});
