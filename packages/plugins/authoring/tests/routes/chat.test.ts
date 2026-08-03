/**
 * Body validation on the chat route. `aiContext` items stay unchecked past
 * being an array — `formatAIContextMessage` sanitises every value it
 * interpolates, and a second check here would drift from it.
 */

import { describe, expect, it, vi } from 'vitest';

// The route module reaches core through the loop; nothing here calls it.
vi.mock('astromech/methods', () => ({
    formatAIContextMessage: vi.fn(),
    getMethodManifest: vi.fn(),
    reduceSurface: vi.fn(),
    annotateManifest: vi.fn(),
    buildScopedDispatch: vi.fn(),
}));

import { readChatRequest } from '../../src/routes/chat.js';

/** A POST carrying `body` verbatim, so malformed JSON stays malformed. */
function post(body: string): Request {
    return new Request('http://localhost/api/plugins/authoring/chat', {
        method: 'POST',
        body,
    });
}

/** A POST carrying `body` as JSON. */
function postJson(body: unknown): Request {
    return post(JSON.stringify(body));
}

describe('readChatRequest', () => {
    it('parses a body of turns with no aiContext', async () => {
        const messages = [
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'hello' },
        ];

        await expect(readChatRequest(postJson({ messages }))).resolves.toEqual({
            messages,
        });
    });

    it('parses an aiContext of arbitrary objects', async () => {
        const messages = [{ role: 'user', content: 'hi' }];
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
            readChatRequest(postJson({ messages: { role: 'user', content: 'hi' } }))
        ).resolves.toBeNull();
    });

    it('rejects a turn with an unknown role', async () => {
        await expect(
            readChatRequest(postJson({ messages: [{ role: 'system', content: 'hi' }] }))
        ).resolves.toBeNull();
    });

    it('rejects a turn whose content is not a string', async () => {
        await expect(
            readChatRequest(postJson({ messages: [{ role: 'user', content: 42 }] }))
        ).resolves.toBeNull();
    });

    it('rejects an aiContext that is not an array', async () => {
        await expect(
            readChatRequest(
                postJson({
                    messages: [{ role: 'user', content: 'hi' }],
                    aiContext: { kind: 'pages' },
                })
            )
        ).resolves.toBeNull();
    });
});
