/**
 * The two halves of the approval gate: pausing a turn that reached a mutating
 * call, and resolving the paused turn the next request carries back.
 */

import type { ToolCallPart, ToolResultPart } from 'ai';
import type { ToolDefinition } from 'astromech';
import { invokeTool } from './tools.js';
import { toApprovalRequest } from '../approvals/request.js';
import type { ApprovalsStorage, ClaimedApproval } from '../approvals/storage.js';
import type { ApprovalDecision, ApprovalRequest, ChatMessage } from '../types.js';

/** A mutating call the model made, paired with the tool it named. */
type MutatingCall = { call: ToolCallPart; tool: ToolDefinition };

/** What an unapproved call answers with. */
const DECLINED = 'The user declined this call, so it was not run.';

/** What a call the user walked away from answers with. */
const ABANDONED = 'The user moved on without answering this, so it was not run.';

// ============================================================================
// Pausing
// ============================================================================

/**
 * Record every mutating call in an assistant turn as pending and return the
 * requests to put to the user. Empty when the turn mutates nothing, which is
 * the signal to let the loop carry on.
 */
export async function pauseForApproval(input: {
    calls: ToolCallPart[];
    tools: ToolDefinition[];
    approvals: ApprovalsStorage;
    userId: string;
}): Promise<ApprovalRequest[]> {
    const calls = mutatingCalls(input.calls, input.tools);
    if (calls.length === 0) return [];

    await input.approvals.expireStale(input.userId);
    const rows = await input.approvals.mint(
        calls.map(({ call, tool }) => ({
            userId: input.userId,
            toolCallId: call.toolCallId,
            method: tool.id,
            toolName: tool.name,
            arguments: argumentsOf(call),
            destructive: tool.annotations.destructiveHint,
        }))
    );

    return rows.map((row) => toApprovalRequest(row, input.tools));
}

/** The calls that name a tool declaring it changes stored data. */
export function mutatingCalls(
    calls: ToolCallPart[],
    tools: ToolDefinition[]
): MutatingCall[] {
    const mutating: MutatingCall[] = [];
    for (const call of calls) {
        const tool = tools.find((candidate) => candidate.name === call.toolName);
        if (tool === undefined || tool.annotations.readOnlyHint) continue;
        mutating.push({ call, tool });
    }
    return mutating;
}

// ============================================================================
// Resuming
// ============================================================================

/**
 * Answer a turn the previous response paused on, or `null` when the transcript
 * ends on nothing pausable. Throws when a claimed approval names a call the
 * posted turn does not contain: the transcript disagrees with the server's own
 * record, which is tampering rather than a race.
 */
export async function resumePausedTurn(input: {
    messages: ChatMessage[];
    tools: ToolDefinition[];
    decisions: ApprovalDecision[];
    approvals: ApprovalsStorage;
    userId: string;
}): Promise<ChatMessage | null> {
    const calls = pausedToolCalls(input.messages);
    if (calls === null) return null;

    const claimed = await input.approvals.claim(input.decisions, input.userId);
    const called = new Set(calls.map((call) => call.toolCallId));
    for (const row of claimed) {
        if (!called.has(row.toolCallId)) {
            throw new Error(
                'An approval names a call the posted conversation does not contain.'
            );
        }
    }

    return {
        role: 'tool',
        content: await buildToolResults({ calls, tools: input.tools, claimed }),
    };
}

/**
 * Fill in a result for every call the transcript leaves unanswered, so the
 * model never sees a dangling call. That happens when the user types a new
 * message instead of answering a pause, and it is a hard 400 — backstopped here
 * rather than left to whatever the browser sends.
 *
 * A tool message is emitted BEFORE the turn that owed it: the Anthropic mapper
 * folds consecutive tool and user messages into one block in message order, and
 * the block has to lead with its results.
 */
export function answerUnansweredCalls(messages: ChatMessage[]): ChatMessage[] {
    const turns: ChatMessage[] = [];
    let owed: ToolCallPart[] = [];

    for (const message of messages) {
        const declines = abandonedResults(owed, message);
        owed = message.role === 'assistant' ? toolCallsIn(message) : [];
        if (declines.length > 0) turns.push({ role: 'tool', content: declines });
        turns.push(message);
    }

    if (owed.length > 0) {
        turns.push({ role: 'tool', content: abandonedResults(owed, undefined) });
    }
    return turns;
}

/** The results `message` still owes `calls`; empty when it answered them all. */
function abandonedResults(
    calls: ToolCallPart[],
    message: ChatMessage | undefined
): ToolResultPart[] {
    if (calls.length === 0) return [];
    const answered = answeredIds(message);
    return calls
        .filter((call) => !answered.has(call.toolCallId))
        .map((call) => textResult(call, ABANDONED));
}

/**
 * The tool-call parts of one assistant turn, in order. A provider-executed call
 * is skipped: the provider answers it server-side, and a result we synthesised
 * for one names an id the request has no matching call for.
 */
function toolCallsIn(message: ChatMessage): ToolCallPart[] {
    if (message.role !== 'assistant' || typeof message.content === 'string') return [];
    return message.content.filter(
        (part): part is ToolCallPart =>
            part.type === 'tool-call' && part.providerExecuted !== true
    );
}

/** The call ids a tool message answers; empty for any other message. */
function answeredIds(message: ChatMessage | undefined): Set<string> {
    if (message === undefined || message.role !== 'tool') return new Set();
    return new Set(
        message.content
            .filter((part): part is ToolResultPart => part.type === 'tool-result')
            .map((part) => part.toolCallId)
    );
}

/**
 * The unanswered calls of a trailing assistant turn, or `null` when there are
 * none. A step that mixed read-only and mutating calls executes the read-only
 * ones before halting, so the paused turn may already be followed by a tool
 * message carrying part of the answer.
 */
export function pausedToolCalls(messages: ChatMessage[]): ToolCallPart[] | null {
    const last = messages[messages.length - 1];
    if (last === undefined) return null;

    // Either the assistant turn is last, or the partial results it already has
    // are — in which case the calls come from the turn before them.
    const [turn, answers] =
        last.role === 'tool' ? [messages[messages.length - 2], last] : [last, undefined];
    if (turn === undefined || turn.role !== 'assistant') return null;

    const answered = answeredIds(answers);
    const pending = toolCallsIn(turn).filter((call) => !answered.has(call.toolCallId));
    return pending.length > 0 ? pending : null;
}

/**
 * One result per call, in order — the model is never left with a dangling call.
 * Nothing else goes in the array: a tool message carries results and no more.
 */
export async function buildToolResults(input: {
    calls: ToolCallPart[];
    tools: ToolDefinition[];
    claimed: ClaimedApproval[];
}): Promise<ToolResultPart[]> {
    const results: ToolResultPart[] = [];
    for (const call of input.calls) {
        results.push(textResult(call, await resultFor(call, input)));
    }
    return results;
}

/**
 * What one call answers with. A gated call runs with the ARGUMENTS OFF ITS ROW,
 * never the posted call's input, so editing the transcript cannot change what
 * an approval runs.
 */
async function resultFor(
    call: ToolCallPart,
    input: { tools: ToolDefinition[]; claimed: ClaimedApproval[] }
): Promise<string> {
    const tool = input.tools.find((candidate) => candidate.name === call.toolName);
    // The user's role changed between the pause and the answer, so the tool the
    // model called is no longer theirs to call.
    if (tool === undefined) {
        return `"${call.toolName}" is no longer available, so it was not run.`;
    }
    if (tool.annotations.readOnlyHint) return invokeTool(tool, argumentsOf(call));

    const row = input.claimed.find(
        (candidate) => candidate.toolCallId === call.toolCallId
    );
    // A decline is an answer, not a failure: the result is not an error, so the
    // model treats it as an outcome and moves on.
    if (row === undefined || row.action !== 'approve') return DECLINED;

    return invokeTool(tool, row.arguments);
}

/** One call's answer as a text result. */
function textResult(call: ToolCallPart, value: string): ToolResultPart {
    return {
        type: 'tool-result',
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: { type: 'text', value },
    };
}

/** A call's input as an argument object; the SDK types it as `unknown`. */
function argumentsOf(call: ToolCallPart): Record<string, unknown> {
    return (call.input ?? {}) as Record<string, unknown>;
}
