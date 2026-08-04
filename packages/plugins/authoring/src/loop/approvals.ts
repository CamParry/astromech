/**
 * The two halves of the approval gate: pausing a turn that reached a mutating
 * call, and resolving the paused turn the next request carries back.
 */

import type {
    BetaContentBlockParam,
    BetaToolResultBlockParam,
    BetaToolUseBlockParam,
} from '@anthropic-ai/sdk/resources/beta';
import type { ToolDefinition } from 'astromech';
import { invokeTool } from './tools.js';
import { toApprovalRequest } from '../approvals/request.js';
import type { ApprovalsStorage, ClaimedApproval } from '../approvals/storage.js';
import type { ApprovalDecision, ApprovalRequest, ChatMessage } from '../types.js';

/** A mutating call the model made, paired with the tool it named. */
type MutatingCall = { block: BetaToolUseBlockParam; tool: ToolDefinition };

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
 * the signal to let the runner execute it.
 */
export async function pauseForApproval(input: {
    content: BetaContentBlockParam[];
    tools: ToolDefinition[];
    approvals: ApprovalsStorage;
    userId: string;
}): Promise<ApprovalRequest[]> {
    const calls = mutatingCalls(input.content, input.tools);
    if (calls.length === 0) return [];

    await input.approvals.expireStale(input.userId);
    const rows = await input.approvals.mint(
        calls.map(({ block, tool }) => ({
            userId: input.userId,
            toolUseId: block.id,
            method: tool.id,
            toolName: tool.name,
            arguments: argumentsOf(block),
            destructive: tool.annotations.destructiveHint,
        }))
    );

    return rows.map((row) => toApprovalRequest(row, input.tools));
}

/** The calls in `content` that name a tool declaring it changes stored data. */
export function mutatingCalls(
    content: BetaContentBlockParam[],
    tools: ToolDefinition[]
): MutatingCall[] {
    const calls: MutatingCall[] = [];
    for (const block of content) {
        if (block.type !== 'tool_use') continue;
        const tool = tools.find((candidate) => candidate.name === block.name);
        if (tool === undefined || tool.annotations.readOnlyHint) continue;
        calls.push({ block, tool });
    }
    return calls;
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
    const toolUses = pausedToolUses(input.messages);
    if (toolUses === null) return null;

    const claimed = await input.approvals.claim(input.decisions, input.userId);
    const called = new Set(toolUses.map((block) => block.id));
    for (const row of claimed) {
        if (!called.has(row.toolUseId)) {
            throw new Error(
                'An approval names a call the posted conversation does not contain.'
            );
        }
    }

    const content = await buildToolResults({
        toolUses,
        tools: input.tools,
        claimed,
    });

    return { role: 'user', content };
}

/**
 * Fill in a `tool_result` for every call the following turn leaves unanswered,
 * so the API never receives a dangling `tool_use`. That happens when the user
 * types a new message instead of answering a pause, and it is a hard 400 —
 * backstopped here rather than left to whatever the browser sends.
 */
export function answerUnansweredCalls(messages: ChatMessage[]): ChatMessage[] {
    const turns: ChatMessage[] = [];
    let owed: BetaToolUseBlockParam[] = [];

    for (const message of messages) {
        const declines = abandonedResults(owed, message);
        owed = message.role === 'assistant' ? toolUsesIn(message.content) : [];
        if (declines.length === 0) {
            turns.push(message);
            continue;
        }
        // Merged into a following user turn rather than inserted before it:
        // `tool_result` blocks lead the turn they ride in, and two user turns
        // in a row is not a shape the API takes.
        if (message.role === 'user') {
            turns.push({ role: 'user', content: [...declines, ...message.content] });
            continue;
        }
        turns.push({ role: 'user', content: declines });
        turns.push(message);
    }

    if (owed.length > 0) {
        turns.push({ role: 'user', content: abandonedResults(owed, undefined) });
    }
    return turns;
}

/** The results `message` still owes `calls`; empty when it answered them all. */
function abandonedResults(
    calls: BetaToolUseBlockParam[],
    message: ChatMessage | undefined
): BetaToolResultBlockParam[] {
    if (calls.length === 0) return [];
    const answered = new Set(
        (message?.content ?? [])
            .filter((block) => block.type === 'tool_result')
            .map((block) => block.tool_use_id)
    );
    return calls
        .filter((block) => !answered.has(block.id))
        .map((block) => ({
            type: 'tool_result',
            tool_use_id: block.id,
            content: ABANDONED,
        }));
}

/** The `tool_use` blocks in one turn's content, in order. */
function toolUsesIn(content: BetaContentBlockParam[]): BetaToolUseBlockParam[] {
    return content.filter(
        (block): block is BetaToolUseBlockParam => block.type === 'tool_use'
    );
}

/**
 * The `tool_use` blocks of a trailing assistant turn — the turn is paused iff
 * it has any, because the runner never leaves an executed call unanswered.
 */
export function pausedToolUses(messages: ChatMessage[]): BetaToolUseBlockParam[] | null {
    const last = messages[messages.length - 1];
    if (last === undefined || last.role !== 'assistant') return null;
    const toolUses = toolUsesIn(last.content);
    return toolUses.length > 0 ? toolUses : null;
}

/**
 * One `tool_result` per `tool_use`, in order — the API rejects a turn that
 * leaves any of them unanswered. Nothing else goes in the array: `tool_result`
 * blocks have to come first in the content they are sent in.
 */
export async function buildToolResults(input: {
    toolUses: BetaToolUseBlockParam[];
    tools: ToolDefinition[];
    claimed: ClaimedApproval[];
}): Promise<BetaContentBlockParam[]> {
    const results: BetaToolResultBlockParam[] = [];
    for (const block of input.toolUses) {
        results.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: await resultFor(block, input),
        });
    }
    return results;
}

/**
 * What one call answers with. A gated call runs with the ARGUMENTS OFF ITS ROW,
 * never the posted block's input, so editing the transcript cannot change what
 * an approval runs.
 */
async function resultFor(
    block: BetaToolUseBlockParam,
    input: { tools: ToolDefinition[]; claimed: ClaimedApproval[] }
): Promise<string> {
    const tool = input.tools.find((candidate) => candidate.name === block.name);
    // The user's role changed between the pause and the answer, so the tool the
    // model called is no longer theirs to call.
    if (tool === undefined) {
        return `"${block.name}" is no longer available, so it was not run.`;
    }
    if (tool.annotations.readOnlyHint) return invokeTool(tool, argumentsOf(block));

    const row = input.claimed.find((candidate) => candidate.toolUseId === block.id);
    // A decline is an answer, not a failure: `is_error` stays unset so the model
    // treats it as a result and moves on.
    if (row === undefined || row.action !== 'approve') return DECLINED;

    return invokeTool(tool, row.arguments);
}

/** A call's input as an argument object; the SDK types it as `unknown`. */
function argumentsOf(block: BetaToolUseBlockParam): Record<string, unknown> {
    return (block.input ?? {}) as Record<string, unknown>;
}
