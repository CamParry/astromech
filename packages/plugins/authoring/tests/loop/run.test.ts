/**
 * Where the gate sits in the loop: a turn reaching a mutating call stops before
 * `generateToolResponse`, which is the call that would execute it, and still
 * closes the stream with `done`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BetaMessage, BetaMessageParam } from '@anthropic-ai/sdk/resources/beta';
import type { PluginLogger, ToolDefinition } from 'astromech';
import { runAuthoringLoop } from '../../src/loop/run.js';
import type {
    ChatEvent,
    ChatMessage,
    ResolvedAuthoringOptions,
} from '../../src/types.js';
import { fakeApprovals } from './fake-approvals.js';
import { fakeSessions } from '../sessions/fake-sessions.js';
import type { FakeSessions } from '../sessions/fake-sessions.js';

const generateToolResponse = vi.fn<() => Promise<null>>();
const toolRunner = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
    Anthropic: class {
        beta = { messages: { toolRunner } };
    },
}));

// The loop only reaches core to format AI context, and none is sent here.
vi.mock('astromech', () => ({ formatAIContextMessage: vi.fn(() => null) }));

const OPTIONS: ResolvedAuthoringOptions = {
    model: 'claude-opus-5',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    effort: 'medium',
    readOnly: false,
};

const logger: PluginLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** A tool that records its invocations. */
function toolFor(name: string, readOnly: boolean): ToolDefinition {
    return {
        name,
        id: name.replaceAll('_', '.'),
        description: `Calls ${name}.`,
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: {
            readOnlyHint: readOnly,
            destructiveHint: false,
            idempotentHint: false,
        },
        permission: null,
        permissionDynamic: false,
        confirmMessage: () => `Run "${name}"?`,
        invoke: vi.fn(async () => ({ ok: true })),
    };
}

/** One assistant reply carrying `content`, as the SDK returns it. */
function reply(content: BetaMessage['content']): BetaMessage {
    return { role: 'assistant', content } as BetaMessage;
}

/** A runner yielding one stream per reply, each with no delta events. */
function runnerOver(replies: BetaMessage[]) {
    return {
        generateToolResponse,
        async *[Symbol.asyncIterator]() {
            for (const message of replies) {
                yield {
                    // eslint-disable-next-line @typescript-eslint/no-empty-function
                    async *[Symbol.asyncIterator]() {},
                    finalMessage: async () => message,
                };
            }
        },
    };
}

/** Drain the loop into the events it yielded, against `sessions`. */
async function collect(
    tools: ToolDefinition[],
    messages: ChatMessage[] = [{ role: 'user', content: [{ type: 'text', text: 'go' }] }]
): Promise<ChatEvent[]> {
    const approvals = fakeApprovals();
    const events: ChatEvent[] = [];
    for await (const event of runAuthoringLoop({
        apiKey: 'sk-test',
        options: OPTIONS,
        tools,
        messages,
        aiContext: [],
        logger,
        approvals: approvals.storage,
        sessions: sessions.storage,
        userId: 'user_1',
        decisions: [],
    })) {
        events.push(event);
    }
    return events;
}

/** The transcript stored for the acting user, or undefined when none is. */
function stored(): ChatMessage[] | undefined {
    return sessions.rows.get('user_1');
}

/** The turns the last request would have gone to the API with. */
function sentMessages(): BetaMessageParam[] {
    const [request] = toolRunner.mock.calls[0] as [{ messages: BetaMessageParam[] }];
    return request.messages;
}

/** Does every `tool_use` in `turns` have a `tool_result` in the turn after it? */
function everyCallAnswered(turns: BetaMessageParam[]): boolean {
    return turns.every((turn, index) => {
        const content = turn.content;
        if (typeof content === 'string') return true;
        const calls = content.filter((block) => block.type === 'tool_use');
        if (calls.length === 0) return true;
        const next = turns[index + 1]?.content;
        const answered = new Set(
            (typeof next === 'string' ? [] : (next ?? []))
                .filter((block) => block.type === 'tool_result')
                .map((block) => block.tool_use_id)
        );
        return calls.every((block) => answered.has(block.id));
    });
}

let sessions: FakeSessions;

beforeEach(() => {
    vi.clearAllMocks();
    generateToolResponse.mockResolvedValue(null);
    sessions = fakeSessions();
});

describe('runAuthoringLoop', () => {
    it('lets a turn of read-only calls run', async () => {
        toolRunner.mockReturnValue(
            runnerOver([
                reply([
                    {
                        type: 'tool_use',
                        id: 'toolu_1',
                        name: 'entries_page_query',
                        input: {},
                    },
                ]),
            ])
        );

        const events = await collect([toolFor('entries_page_query', true)]);

        expect(generateToolResponse).toHaveBeenCalled();
        expect(events.map((event) => event.type)).toEqual(['message', 'done']);
    });

    it('pauses on a mutating call, executing nothing', async () => {
        toolRunner.mockReturnValue(
            runnerOver([
                reply([
                    {
                        type: 'tool_use',
                        id: 'toolu_1',
                        name: 'entries_page_update',
                        input: { id: 'page_1' },
                    },
                ]),
            ])
        );
        const update = toolFor('entries_page_update', false);

        const events = await collect([update]);

        expect(generateToolResponse).not.toHaveBeenCalled();
        expect(update.invoke).not.toHaveBeenCalled();
        expect(events.map((event) => event.type)).toEqual([
            'message',
            'approval-required',
            'done',
        ]);
        const paused = events[1];
        expect(paused?.type === 'approval-required' && paused.requests).toMatchObject([
            { toolUseId: 'toolu_1', method: 'entries.page.update' },
        ]);
    });

    it('answers a pause the user typed straight past, so the request stays valid', async () => {
        toolRunner.mockReturnValue(runnerOver([reply([{ type: 'text', text: 'ok' }])]));

        await collect(
            [toolFor('entries_page_update', false)],
            [
                { role: 'user', content: [{ type: 'text', text: 'update it' }] },
                {
                    role: 'assistant',
                    content: [
                        {
                            type: 'tool_use',
                            id: 'toolu_1',
                            name: 'entries_page_update',
                            input: { id: 'page_1' },
                        },
                    ],
                },
                {
                    role: 'user',
                    content: [{ type: 'text', text: 'no, do this instead' }],
                },
            ]
        );

        const sent = sentMessages();
        expect(everyCallAnswered(sent)).toBe(true);
        expect(sent).toHaveLength(3);
        expect(sent[2]?.content).toEqual([
            {
                type: 'tool_result',
                tool_use_id: 'toolu_1',
                content: 'The user moved on without answering this, so it was not run.',
            },
            { type: 'text', text: 'no, do this instead' },
        ]);
    });
});

describe('runAuthoringLoop session storage', () => {
    it('stores the posted turns plus the assistant turn that answered them', async () => {
        toolRunner.mockReturnValue(
            runnerOver([reply([{ type: 'text', text: 'hello' }])])
        );

        await collect([]);

        expect(stored()).toEqual([
            { role: 'user', content: [{ type: 'text', text: 'go' }] },
            { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
        ]);
    });

    it('stores a paused turn whole, so the pause has something to resume from', async () => {
        const call = {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'entries_page_update',
            input: { id: 'page_1' },
        } as const;
        toolRunner.mockReturnValue(
            runnerOver([
                reply([{ type: 'thinking', thinking: '', signature: 'sig' }, call]),
            ])
        );

        await collect([toolFor('entries_page_update', false)]);

        expect(stored()).toEqual([
            { role: 'user', content: [{ type: 'text', text: 'go' }] },
            {
                role: 'assistant',
                content: [{ type: 'thinking', thinking: '', signature: 'sig' }, call],
            },
        ]);
    });

    it('stores the tool results a completed call answered with', async () => {
        toolRunner.mockReturnValue(
            runnerOver([
                reply([
                    {
                        type: 'tool_use',
                        id: 'toolu_1',
                        name: 'entries_page_query',
                        input: {},
                    },
                ]),
            ])
        );
        generateToolResponse.mockResolvedValue({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{}' }],
        } as never);

        await collect([toolFor('entries_page_query', true)]);

        expect(stored()?.at(-1)).toEqual({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{}' }],
        });
    });

    it('carries the turn on when the transcript is past the size cap', async () => {
        sessions.storage.save = vi.fn(async () => false);
        toolRunner.mockReturnValue(
            runnerOver([reply([{ type: 'text', text: 'hello' }])])
        );

        const events = await collect([]);

        expect(events.map((event) => event.type)).toEqual(['message', 'done']);
        expect(logger.warn).toHaveBeenCalled();
    });

    it('carries the turn on when the write throws', async () => {
        sessions.storage.save = vi.fn(async () => {
            throw new Error('database is locked');
        });
        toolRunner.mockReturnValue(
            runnerOver([reply([{ type: 'text', text: 'hello' }])])
        );

        const events = await collect([]);

        expect(events.map((event) => event.type)).toEqual(['message', 'done']);
        expect(logger.error).toHaveBeenCalled();
    });
});
