/**
 * The approval gate either side of the pause: which calls are held back, and
 * what a resumed turn answers with. The arguments an approved call runs with
 * come off the server's row, never off the transcript that was posted back.
 */

import type { ChatMessage } from '../../src/types';
import type { TextPart, ToolCallPart, ToolResultPart } from 'ai';
import type { ToolDefinition } from 'astromech';
import { describe, expect, it, vi } from 'vitest';
import {
    answerUnansweredCalls,
    mutatingCalls,
    pausedToolCalls,
    pauseForApproval,
    resumePausedTurn,
} from '../../src/loop/approvals';
import { approvalRow, fakeApprovals } from './fake-approvals';

/** A tool that records what it was invoked with. */
function toolFor(
    name: string,
    options: { readOnly?: boolean; destructive?: boolean } = {}
): ToolDefinition {
    const readOnly = options.readOnly ?? false;
    return {
        name,
        id: name.replaceAll('_', '.'),
        description: `Calls ${name}.`,
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: {
            readOnlyHint: readOnly,
            destructiveHint: options.destructive ?? false,
            idempotentHint: false,
        },
        permission: null,
        permissionDynamic: false,
        confirmMessage: (args) => `Run "${name}" with ${JSON.stringify(args)}?`,
        invoke: vi.fn(async (args) => ({ ran: name, args })),
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
function assistant(content: (TextPart | ToolCallPart)[]): ChatMessage {
    return { role: 'assistant', content };
}

const UPDATE = 'entries_page_update';
const QUERY = 'entries_page_query';

describe('pauseForApproval', () => {
    it('holds nothing back when every call is read-only', async () => {
        const query = toolFor(QUERY, { readOnly: true });
        const approvals = fakeApprovals();

        const requests = await pauseForApproval({
            calls: [call('toolu_1', QUERY, { limit: 5 })],
            tools: [query],
            approvals: approvals.storage,
            userId: 'user_1',
        });

        expect(requests).toEqual([]);
        expect(approvals.storage.mint).not.toHaveBeenCalled();
        expect(query.invoke).not.toHaveBeenCalled();
    });

    it('records a pending row per mutating call and runs none of them', async () => {
        const update = toolFor(UPDATE, { destructive: true });
        const approvals = fakeApprovals();

        const requests = await pauseForApproval({
            calls: [call('toolu_1', UPDATE, { id: 'page_1' })],
            tools: [update],
            approvals: approvals.storage,
            userId: 'user_1',
        });

        expect(update.invoke).not.toHaveBeenCalled();
        expect(approvals.rows).toEqual([
            expect.objectContaining({
                userId: 'user_1',
                toolCallId: 'toolu_1',
                method: 'entries.page.update',
                toolName: UPDATE,
                arguments: { id: 'page_1' },
                destructive: true,
                status: 'pending',
            }),
        ]);
        expect(requests).toEqual([
            expect.objectContaining({
                toolCallId: 'toolu_1',
                method: 'entries.page.update',
                toolName: UPDATE,
                destructive: true,
                arguments: { id: 'page_1' },
                message: `Run "${UPDATE}" with {"id":"page_1"}?`,
            }),
        ]);
    });

    it("sweeps this user's abandoned rows before minting", async () => {
        const approvals = fakeApprovals();

        await pauseForApproval({
            calls: [call('toolu_1', UPDATE)],
            tools: [toolFor(UPDATE)],
            approvals: approvals.storage,
            userId: 'user_1',
        });

        expect(approvals.storage.expireStale).toHaveBeenCalledWith('user_1');
    });

    it('ignores a call naming a tool the surface does not hold', async () => {
        const approvals = fakeApprovals();

        const requests = await pauseForApproval({
            calls: [call('toolu_1', 'users_delete')],
            tools: [toolFor(UPDATE)],
            approvals: approvals.storage,
            userId: 'user_1',
        });

        expect(requests).toEqual([]);
    });
});

describe('mutatingCalls', () => {
    it('picks out only the calls whose tool changes stored data', () => {
        const calls = mutatingCalls(
            [call('toolu_1', QUERY), call('toolu_2', UPDATE)],
            [toolFor(QUERY, { readOnly: true }), toolFor(UPDATE)]
        );

        expect(calls.map(({ call: found }) => found.toolCallId)).toEqual(['toolu_2']);
    });
});

describe('pausedToolCalls', () => {
    it('is null when the transcript ends on a user turn', () => {
        expect(
            pausedToolCalls([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }])
        ).toBeNull();
    });

    it('is null when the last assistant turn called nothing', () => {
        expect(pausedToolCalls([assistant([{ type: 'text', text: 'done' }])])).toBeNull();
    });

    it("is the trailing turn's calls", () => {
        const found = pausedToolCalls([assistant([call('toolu_1', UPDATE)])]);

        expect(found?.map((part) => part.toolCallId)).toEqual(['toolu_1']);
    });
});

describe('resumePausedTurn', () => {
    /** The standard resume: one paused update, answered by `action`. */
    async function resume(input: {
        action: 'approve' | 'reject';
        row?: ReturnType<typeof approvalRow>;
        posted?: ToolCallPart[];
        tools?: ToolDefinition[];
        userId?: string;
    }) {
        const update = input.tools?.[0] ?? toolFor(UPDATE);
        const row = input.row ?? approvalRow();
        const approvals = fakeApprovals([row]);
        const message = await resumePausedTurn({
            messages: [assistant(input.posted ?? [call('toolu_1', UPDATE)])],
            tools: input.tools ?? [update],
            decisions: [{ approvalId: row.id, action: input.action }],
            approvals: approvals.storage,
            userId: input.userId ?? 'user_1',
        });
        return { message, approvals, update };
    }

    it('is null when nothing is paused', async () => {
        const approvals = fakeApprovals();

        await expect(
            resumePausedTurn({
                messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
                tools: [],
                decisions: [],
                approvals: approvals.storage,
                userId: 'user_1',
            })
        ).resolves.toBeNull();
    });

    it("runs an approved call with the row's arguments, not the posted ones", async () => {
        const { message, update } = await resume({
            action: 'approve',
            posted: [
                call('toolu_1', UPDATE, { id: 'page_1', fields: { title: 'Forged' } }),
            ],
        });

        expect(update.invoke).toHaveBeenCalledWith({
            id: 'page_1',
            fields: { title: 'From the row' },
        });
        expect(message?.role).toBe('tool');
        expect(message?.content).toEqual([
            result(
                'toolu_1',
                UPDATE,
                JSON.stringify({
                    ran: UPDATE,
                    args: { id: 'page_1', fields: { title: 'From the row' } },
                })
            ),
        ]);
    });

    it('declines a rejected call without invoking it', async () => {
        const { message, update } = await resume({ action: 'reject' });

        expect(update.invoke).not.toHaveBeenCalled();
        expect(message?.content[0]).toEqual(
            result('toolu_1', UPDATE, 'The user declined this call, so it was not run.')
        );
    });

    it('declines a row belonging to another user', async () => {
        const { message, update } = await resume({
            action: 'approve',
            row: approvalRow({ userId: 'someone_else' }),
        });

        expect(update.invoke).not.toHaveBeenCalled();
        expect(message?.content[0]).toMatchObject({
            output: { value: 'The user declined this call, so it was not run.' },
        });
    });

    it('declines a row past its expiry', async () => {
        const { message, update } = await resume({
            action: 'approve',
            row: approvalRow({ expiresAt: new Date(Date.now() - 1000) }),
        });

        expect(update.invoke).not.toHaveBeenCalled();
        expect(message?.content[0]).toMatchObject({
            output: { value: 'The user declined this call, so it was not run.' },
        });
    });

    it('answers a call whose tool the user may no longer make', async () => {
        const { message } = await resume({ action: 'approve', tools: [] });

        expect(message?.content[0]).toEqual(
            result(
                'toolu_1',
                UPDATE,
                `"${UPDATE}" is no longer available, so it was not run.`
            )
        );
    });

    it('runs a read-only call with its own input, ungated', async () => {
        const query = toolFor(QUERY, { readOnly: true });
        const approvals = fakeApprovals();

        const message = await resumePausedTurn({
            messages: [assistant([call('toolu_9', QUERY, { limit: 5 })])],
            tools: [query],
            decisions: [],
            approvals: approvals.storage,
            userId: 'user_1',
        });

        expect(query.invoke).toHaveBeenCalledWith({ limit: 5 });
        expect(message?.content).toHaveLength(1);
    });

    it('answers every call in the turn, in order', async () => {
        const query = toolFor(QUERY, { readOnly: true });
        const row = approvalRow({ toolCallId: 'toolu_2' });
        const approvals = fakeApprovals([row]);

        const message = await resumePausedTurn({
            messages: [
                assistant([
                    call('toolu_1', QUERY),
                    call('toolu_2', UPDATE),
                    call('toolu_3', UPDATE),
                ]),
            ],
            tools: [query, toolFor(UPDATE)],
            decisions: [{ approvalId: row.id, action: 'approve' }],
            approvals: approvals.storage,
            userId: 'user_1',
        });

        const content = message?.content as ToolResultPart[] | undefined;
        expect(content?.map((part) => part.toolCallId)).toEqual([
            'toolu_1',
            'toolu_2',
            'toolu_3',
        ]);
    });

    it('refuses the whole request when an approval names a call the turn lacks', async () => {
        const row = approvalRow({ toolCallId: 'toolu_elsewhere' });
        const approvals = fakeApprovals([row]);
        const update = toolFor(UPDATE);

        await expect(
            resumePausedTurn({
                messages: [assistant([call('toolu_1', UPDATE)])],
                tools: [update],
                decisions: [{ approvalId: row.id, action: 'approve' }],
                approvals: approvals.storage,
                userId: 'user_1',
            })
        ).rejects.toThrow('does not contain');
        expect(update.invoke).not.toHaveBeenCalled();
    });

    it('marks the row answered and drops its arguments', async () => {
        const { approvals } = await resume({ action: 'approve' });

        expect(approvals.rows[0]).toMatchObject({
            status: 'approved',
            arguments: null,
        });
        expect(approvals.rows[0]?.resolvedAt).toBeInstanceOf(Date);
    });

    it('runs the call once when the same decision is posted twice', async () => {
        const update = toolFor(UPDATE);
        const row = approvalRow();
        const approvals = fakeApprovals([row]);
        const request = {
            messages: [assistant([call('toolu_1', UPDATE)])],
            tools: [update],
            decisions: [{ approvalId: row.id, action: 'approve' as const }],
            approvals: approvals.storage,
            userId: 'user_1',
        };

        const [first, second] = await Promise.all([
            resumePausedTurn(request),
            resumePausedTurn(request),
        ]);

        expect(update.invoke).toHaveBeenCalledTimes(1);
        const answers = [first, second].map(
            (message) =>
                (message?.content[0] as { output: { value: string } }).output.value
        );
        expect(answers).toContain('The user declined this call, so it was not run.');
    });
});

describe('answerUnansweredCalls', () => {
    const ABANDONED = 'The user moved on without answering this, so it was not run.';

    it('leaves an answered transcript alone', () => {
        const messages: ChatMessage[] = [
            { role: 'user', content: [{ type: 'text', text: 'hi' }] },
            assistant([call('toolu_1', UPDATE)]),
            { role: 'tool', content: [result('toolu_1', UPDATE, 'done')] },
        ];

        expect(answerUnansweredCalls(messages)).toEqual(messages);
    });

    it('answers a pause the user typed straight past, so the request stays valid', () => {
        const turns = answerUnansweredCalls([
            assistant([call('toolu_1', UPDATE)]),
            { role: 'user', content: [{ type: 'text', text: 'actually, never mind' }] },
        ]);

        // The decline rides in its own tool message, emitted ahead of the turn
        // it precedes rather than folded into it.
        expect(turns).toHaveLength(3);
        expect(turns[1]).toEqual({
            role: 'tool',
            content: [result('toolu_1', UPDATE, ABANDONED)],
        });
        expect(turns[2]).toEqual({
            role: 'user',
            content: [{ type: 'text', text: 'actually, never mind' }],
        });
    });

    it('answers a call the next turn left out', () => {
        const turns = answerUnansweredCalls([
            assistant([call('toolu_1', UPDATE), call('toolu_2', QUERY)]),
            { role: 'tool', content: [result('toolu_1', UPDATE, 'done')] },
        ]);

        expect(turns).toHaveLength(3);
        expect(turns[1]).toEqual({
            role: 'tool',
            content: [result('toolu_2', QUERY, ABANDONED)],
        });
        expect(turns[2]).toEqual({
            role: 'tool',
            content: [result('toolu_1', UPDATE, 'done')],
        });
    });

    it('answers a trailing turn nothing follows', () => {
        const turns = answerUnansweredCalls([assistant([call('toolu_1', UPDATE)])]);

        expect(turns).toHaveLength(2);
        expect(turns[1]).toEqual({
            role: 'tool',
            content: [result('toolu_1', UPDATE, ABANDONED)],
        });
    });

    it('inserts a turn when an assistant turn follows the calls', () => {
        const turns = answerUnansweredCalls([
            assistant([call('toolu_1', UPDATE)]),
            assistant([{ type: 'text', text: 'moving on' }]),
        ]);

        expect(turns.map((turn) => turn.role)).toEqual([
            'assistant',
            'tool',
            'assistant',
        ]);
    });
});

/**
 * A provider-executed call — Anthropic's tool search runs and answers these
 * server-side. Synthesising a result for one names a `srvtoolu_` id the request
 * has no matching call for, which the API rejects outright.
 */
function providerCall(id: string, name: string): ToolCallPart {
    return {
        type: 'tool-call',
        toolCallId: id,
        toolName: name,
        input: {},
        providerExecuted: true,
    };
}

describe('provider-executed calls', () => {
    const searched: ChatMessage = {
        role: 'assistant',
        content: [providerCall('srvtoolu_1', 'tool_search_tool_regex')],
    };

    it('is not treated as a paused turn awaiting approval', () => {
        expect(pausedToolCalls([searched])).toBeNull();
    });

    it('is not answered with an abandoned result', () => {
        expect(answerUnansweredCalls([searched])).toEqual([searched]);
    });

    it('leaves a client call beside it still answerable', () => {
        const mixed: ChatMessage = {
            role: 'assistant',
            content: [
                providerCall('srvtoolu_1', 'tool_search_tool_regex'),
                call('toolu_1', UPDATE, { id: 'page_1' }),
            ],
        };

        const pending = pausedToolCalls([mixed]);
        expect(pending?.map((part) => part.toolCallId)).toEqual(['toolu_1']);
    });
});
