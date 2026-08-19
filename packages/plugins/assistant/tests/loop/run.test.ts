/**
 * Where the gate sits in the loop: a turn reaching a mutating call stops before
 * anything runs it, and still closes the stream with `done`.
 */

import type { ChatEvent, ChatMessage, ResolvedAssistantOptions } from '../../src/types';
import type { FakeSessions } from '../sessions/fake-sessions';
import type {
    LanguageModel,
    ModelMessage,
    TextPart,
    ToolCallPart,
    ToolResultPart,
} from 'ai';
import type * as AiModule from 'ai';
import type { PluginLogger, ToolDefinition } from 'astromech';
import { streamText } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssistantLoop } from '../../src/loop/run';
import { fakeSessions } from '../sessions/fake-sessions';
import { fakeApprovals } from './fake-approvals';

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof AiModule>()),
    streamText: vi.fn(),
}));

// The loop only reaches core to format AI context, and none is sent here.
vi.mock('astromech', () => ({ formatAiContextMessage: vi.fn(() => null) }));

const streamTextMock = vi.mocked(streamText);

const OPTIONS: ResolvedAssistantOptions = {
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

/** One `tool-call` part, as the model emits it. */
function call(id: string, name: string, input: unknown = {}): ToolCallPart {
    return { type: 'tool-call', toolCallId: id, toolName: name, input };
}

/** One `tool-result` part answering `id`. */
function result(id: string, name: string, value: string): ToolResultPart {
    return {
        type: 'tool-result',
        toolCallId: id,
        toolName: name,
        output: { type: 'text', value },
    };
}

/** An assistant turn carrying `content`. */
function assistant(
    content: (TextPart | ToolCallPart | { type: 'reasoning'; text: string })[]
): ChatMessage {
    return { role: 'assistant', content };
}

/** What one step of `streamText` produces: the messages `onStepEnd` reports. */
type FakeStep = { textDeltas?: string[]; messages: ChatMessage[] };

/**
 * Wire the mocked `streamText` to run through `steps` in order. Each step's
 * `onStepEnd` fires — carrying the messages that step generated — before its
 * `finish-step` part streams, matching what `runAssistantLoop` waits on.
 */
function mockStreamText(steps: FakeStep[]): void {
    streamTextMock.mockImplementation(((options: {
        onStepEnd?: (step: { response: { messages: ChatMessage[] } }) => void;
    }) => ({
        fullStream: (async function* () {
            for (const step of steps) {
                for (const text of step.textDeltas ?? []) {
                    yield { type: 'text-delta', text };
                }
                options.onStepEnd?.({ response: { messages: step.messages } });
                yield { type: 'finish-step' };
            }
        })(),
    })) as never);
}

/** Drain the loop into the events it yielded, against `sessions`. */
async function collect(
    tools: ToolDefinition[],
    messages: ChatMessage[] = [{ role: 'user', content: [{ type: 'text', text: 'go' }] }]
): Promise<ChatEvent[]> {
    const approvals = fakeApprovals();
    const events: ChatEvent[] = [];
    for await (const event of runAssistantLoop({
        model: {} as LanguageModel,
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

/** The turns the last request would have gone to the model with. */
function sentMessages(): ModelMessage[] {
    const [options] = streamTextMock.mock.calls[0] as [{ messages: ModelMessage[] }];
    return options.messages;
}

/** Does every `tool-call` in `turns` have a `tool-result` in the turn after it? */
function everyCallAnswered(turns: ModelMessage[]): boolean {
    return turns.every((turn, index) => {
        const content = turn.content;
        if (typeof content === 'string') return true;
        const calls = content.filter(
            (part): part is ToolCallPart => part.type === 'tool-call'
        );
        if (calls.length === 0) return true;
        const next = turns[index + 1]?.content;
        const answered = new Set(
            (typeof next === 'string' ? [] : (next ?? []))
                .filter((part): part is ToolResultPart => part.type === 'tool-result')
                .map((part) => part.toolCallId)
        );
        return calls.every((toolCall) => answered.has(toolCall.toolCallId));
    });
}

const ABANDONED = 'The user moved on without answering this, so it was not run.';

let sessions: FakeSessions;

beforeEach(() => {
    vi.clearAllMocks();
    sessions = fakeSessions();
});

describe('runAssistantLoop', () => {
    it('lets a turn of read-only calls run', async () => {
        mockStreamText([
            { messages: [assistant([call('toolu_1', 'entries_page_query', {})])] },
        ]);

        const events = await collect([toolFor('entries_page_query', true)]);

        expect(streamText).toHaveBeenCalled();
        expect(events.map((event) => event.type)).toEqual(['message', 'done']);
    });

    it('pauses on a mutating call, executing nothing', async () => {
        mockStreamText([
            {
                messages: [
                    assistant([call('toolu_1', 'entries_page_update', { id: 'page_1' })]),
                ],
            },
        ]);
        const update = toolFor('entries_page_update', false);

        const events = await collect([update]);

        expect(update.invoke).not.toHaveBeenCalled();
        expect(events.map((event) => event.type)).toEqual([
            'message',
            'approval-required',
            'done',
        ]);
        const paused = events[1];
        expect(paused?.type === 'approval-required' && paused.requests).toMatchObject([
            { toolCallId: 'toolu_1', method: 'entries.page.update' },
        ]);
    });

    it('answers a pause the user typed straight past, so the request stays valid', async () => {
        mockStreamText([{ messages: [assistant([{ type: 'text', text: 'ok' }])] }]);

        await collect(
            [toolFor('entries_page_update', false)],
            [
                { role: 'user', content: [{ type: 'text', text: 'update it' }] },
                assistant([call('toolu_1', 'entries_page_update', { id: 'page_1' })]),
                {
                    role: 'user',
                    content: [{ type: 'text', text: 'no, do this instead' }],
                },
            ]
        );

        const sent = sentMessages();
        expect(everyCallAnswered(sent)).toBe(true);
        expect(sent).toHaveLength(4);
        expect(sent[2]).toEqual({
            role: 'tool',
            content: [result('toolu_1', 'entries_page_update', ABANDONED)],
        });
        expect(sent[3]).toEqual({
            role: 'user',
            content: [{ type: 'text', text: 'no, do this instead' }],
        });
    });
});

describe('runAssistantLoop session storage', () => {
    it('stores the posted turns plus the assistant turn that answered them', async () => {
        mockStreamText([{ messages: [assistant([{ type: 'text', text: 'hello' }])] }]);

        await collect([]);

        expect(stored()).toEqual([
            { role: 'user', content: [{ type: 'text', text: 'go' }] },
            { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
        ]);
    });

    it('stores a paused turn whole, so the pause has something to resume from', async () => {
        const reasoning = {
            type: 'reasoning' as const,
            text: '',
            providerOptions: { anthropic: { signature: 'sig' } },
        };
        const toolCall = call('toolu_1', 'entries_page_update', { id: 'page_1' });
        mockStreamText([{ messages: [assistant([reasoning, toolCall])] }]);

        await collect([toolFor('entries_page_update', false)]);

        expect(stored()).toEqual([
            { role: 'user', content: [{ type: 'text', text: 'go' }] },
            { role: 'assistant', content: [reasoning, toolCall] },
        ]);
    });

    it('stores the tool results a completed call answered with', async () => {
        mockStreamText([
            {
                messages: [
                    assistant([call('toolu_1', 'entries_page_query', {})]),
                    {
                        role: 'tool',
                        content: [result('toolu_1', 'entries_page_query', '{}')],
                    },
                ],
            },
        ]);

        await collect([toolFor('entries_page_query', true)]);

        expect(stored()?.at(-1)).toEqual({
            role: 'tool',
            content: [result('toolu_1', 'entries_page_query', '{}')],
        });
    });

    it('carries the turn on when the transcript is past the size cap', async () => {
        sessions.storage.save = vi.fn(async () => false);
        mockStreamText([{ messages: [assistant([{ type: 'text', text: 'hello' }])] }]);

        const events = await collect([]);

        expect(events.map((event) => event.type)).toEqual(['message', 'done']);
        expect(logger.warn).toHaveBeenCalled();
    });

    it('carries the turn on when the write throws', async () => {
        sessions.storage.save = vi.fn(async () => {
            throw new Error('database is locked');
        });
        mockStreamText([{ messages: [assistant([{ type: 'text', text: 'hello' }])] }]);

        const events = await collect([]);

        expect(events.map((event) => event.type)).toEqual(['message', 'done']);
        expect(logger.error).toHaveBeenCalled();
    });
});
