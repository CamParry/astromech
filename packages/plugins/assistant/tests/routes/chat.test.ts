/**
 * The chat route module: its handler's own refusal of a caller with no user,
 * its 503 for a site with no usable model, and body validation. Content blocks are checked for a `type` and nothing
 * more — deeper checks would reject the block types the transcript
 * deliberately carries through, and the API is the real validator. Each
 * rejection has an example here even where the property test also reaches it:
 * generated bodies reach a rare branch only by chance, and the coverage
 * threshold has to hold on every run.
 */

import type { AiConfig } from '@/types/index';
import { roleWith } from '@tests/fixtures';
import { makeTestConfig } from '@tests/harness';
import { createPluginTestApp } from '@tests/plugin-app';
import { describe, expect, it } from 'vitest';
import { buildAiModels } from '@/ai/models';
import { setAiModels } from '@/ai/registry';
import { assistant, resolveOptions } from '../../src/index';
import { chatRoutes, readChatRequest } from '../../src/routes/chat';

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

// The HTTP app's `enforceAccess` refuses an anonymous caller before the
// handler runs, so the route test cannot tell which of the two refused. This
// calls the handler directly to prove its own check holds without the other.
describe('the chat handler', () => {
    it('refuses a context with no user', async () => {
        const app = await createPluginTestApp('assistant', {
            ...makeTestConfig(),
            plugins: [assistant()],
        });
        const [route] = chatRoutes(resolveOptions());
        if (route === undefined) throw new Error('the chat route is not defined');

        const res = await route.handler(
            postJson({ messages: [text('user', 'hi')] }),
            app.context(),
            {}
        );

        expect(res.status).toBe(401);
        await expect(res.json()).resolves.toEqual({
            error: 'Sign in to use the assistant.',
        });
    });
});

// A site that configures no model, or one the assistant cannot use, still
// boots; the chat request is what fails, before its body is read.
describe('the chat handler without a usable model', () => {
    /**
     * A test app and a signed-in user holding the assistant permission, and a
     * function posting one turn as that user. Setting the app up resets the
     * model registry, so a test registers its model after this.
     */
    async function signedInPost(): Promise<() => Promise<Response>> {
        const app = await createPluginTestApp('assistant', {
            ...makeTestConfig(),
            plugins: [assistant()],
        });
        const user = await app.users.create({
            data: { email: `${crypto.randomUUID()}@test.dev`, name: 'Test User' },
        });
        return () =>
            app.request('POST', '/plugins/assistant/chat', {
                as: { user, role: roleWith(assistant.permissions('use')) },
                body: { messages: [text('user', 'hi')] },
            });
    }

    /** A model that reports `provider`. Nothing here calls it. */
    function modelFrom(provider: string): AiConfig['model'] {
        return {
            specificationVersion: 'v4',
            provider,
            modelId: 'test-model',
            supportedUrls: {},
            doGenerate: () => Promise.reject(new Error('the model was called')),
            doStream: () => Promise.reject(new Error('the model was called')),
        };
    }

    it('answers 503 when the site configures no model', async () => {
        const post = await signedInPost();

        const res = await post();

        expect(res.status).toBe(503);
        await expect(res.json()).resolves.toEqual({
            error: 'The assistant needs a model. Add an `ai` block to astromech.config.ts with one registered as `assistant`.',
        });
    });

    it('answers 503 when the model is not an Anthropic one', async () => {
        const post = await signedInPost();
        // No model is registered as `assistant`, so the default stands in.
        setAiModels(await buildAiModels({ model: modelFrom('openai.chat') }));

        const res = await post();

        expect(res.status).toBe(503);
        await expect(res.json()).resolves.toEqual({
            error: 'The assistant needs an Anthropic model; `assistant` is configured as openai.chat.',
        });
    });
});

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

    it('parses an aiContext of references with their positions', async () => {
        const messages = [text('user', 'hi')];
        const aiContext = [
            { reference: { kind: 'pages', label: 'Dashboard' }, depth: 0, order: 0 },
            {
                reference: {
                    kind: 'entries',
                    type: 'post',
                    id: 'post_1',
                    label: 'Hello',
                },
                depth: 1,
                order: 0,
            },
        ];

        await expect(readChatRequest(postJson({ messages, aiContext }))).resolves.toEqual(
            { messages, aiContext }
        );
    });

    it.each([
        ['an arbitrary object', { anything: 'at all' }],
        ['no reference', { depth: 2, order: 0 }],
        [
            'an unknown kind',
            { reference: { kind: 'widgets', label: 'Home' }, depth: 0, order: 0 },
        ],
        ['no label', { reference: { kind: 'pages' }, depth: 0, order: 0 }],
        [
            'a numeric id',
            { reference: { kind: 'media', id: 7, label: 'Logo' }, depth: 0, order: 0 },
        ],
        ['no position', { reference: { kind: 'pages', label: 'Home' } }],
    ])('rejects an aiContext item with %s', async (_case, item) => {
        await expect(
            readChatRequest(
                postJson({ messages: [text('user', 'hi')], aiContext: [item] })
            )
        ).resolves.toBeNull();
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

    it('rejects a turn that is not an object', async () => {
        await expect(readChatRequest(postJson({ messages: ['hi'] }))).resolves.toBeNull();
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

    it('rejects a decision that is not an object', async () => {
        await expect(
            readChatRequest(
                postJson({ messages: [text('user', 'hi')], decisions: ['ap_1'] })
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
