/**
 * The server-side model loop: assembles one request, runs the Anthropic tool
 * runner, and yields the chat events the SSE route writes to the browser.
 */

import { Anthropic } from '@anthropic-ai/sdk';
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta';
import type { AIContextItem, PluginLogger, ToolDefinition } from 'astromech';
import {
    answerUnansweredCalls,
    pauseForApproval,
    resumePausedTurn,
} from './approvals.js';
import { buildRequest } from './request.js';
import { TOOL_SEARCH, toRunnableTools } from './tools.js';
import { errorMessage } from '../error-message.js';
import type { ApprovalsStorage } from '../approvals/storage.js';
import type { SessionsStorage } from '../sessions/storage.js';
import type {
    ApprovalDecision,
    ChatEvent,
    ChatMessage,
    ResolvedAssistantOptions,
} from '../types.js';

const MAX_TOKENS = 4096;

/** Bounded so a looping model cannot spend a request forever. */
const MAX_ITERATIONS = 12;

/** Run one chat turn, yielding text as it streams and the tools that ran. */
export async function* runAssistantLoop(input: {
    apiKey: string;
    options: ResolvedAssistantOptions;
    tools: ToolDefinition[];
    messages: ChatMessage[];
    aiContext: AIContextItem[];
    logger: PluginLogger;
    approvals: ApprovalsStorage;
    sessions: SessionsStorage;
    userId: string;
    decisions: ApprovalDecision[];
}): AsyncGenerator<ChatEvent> {
    // Every completed turn is appended here and the whole thing is stored, so
    // what comes back on a reload is what the drawer would have posted.
    const turns = [...input.messages];

    /** Store the transcript as it stands. A failed write must not kill the turn. */
    async function persist(): Promise<void> {
        try {
            const stored = await input.sessions.save(input.userId, turns);
            if (!stored) {
                input.logger.warn(
                    'Chat session past its size cap — this conversation will not survive a reload.'
                );
            }
        } catch (error) {
            input.logger.error('Could not store the chat session.', error);
        }
    }

    try {
        const runnableTools = toRunnableTools(input.tools);
        input.logger.info(
            `Chat request running against ${runnableTools.length} tools, found by search`
        );

        // A transcript ending on unanswered calls is a paused turn, and every
        // one of them is answered before a new request is built.
        const resumed = await resumePausedTurn({
            messages: turns,
            tools: input.tools,
            decisions: input.decisions,
            approvals: input.approvals,
            userId: input.userId,
        });
        if (resumed !== null) {
            turns.push(resumed);
            await persist();
            yield { type: 'message', message: resumed };
        }

        const { system, messages } = buildRequest(
            answerUnansweredCalls(turns),
            input.aiContext
        );
        const client = new Anthropic({ apiKey: input.apiKey });
        const runner = client.beta.messages.toolRunner({
            model: input.options.model,
            max_tokens: MAX_TOKENS,
            system,
            output_config: { effort: input.options.effort },
            messages,
            tools: [TOOL_SEARCH, ...runnableTools],
            stream: true,
            max_iterations: MAX_ITERATIONS,
        });

        for await (const stream of runner) {
            for await (const event of stream) {
                if (
                    event.type === 'content_block_delta' &&
                    event.delta.type === 'text_delta'
                ) {
                    yield { type: 'text-delta', text: event.delta.text };
                }
            }
            // Mandatory every turn: returning from the loop body without
            // awaiting the final message aborts the stream.
            const message = await stream.finalMessage();
            const turn: ChatMessage = { role: 'assistant', content: message.content };
            turns.push(turn);
            await persist();
            yield { type: 'message', message: turn };

            // Stop before anything executes when the turn reached a mutating
            // call: `generateToolResponse` is what runs the tools, so the gate
            // has to sit in front of it. Breaking out rather than returning
            // keeps the `done` event below.
            const requests = await pauseForApproval({
                content: message.content,
                tools: input.tools,
                approvals: input.approvals,
                userId: input.userId,
            });
            if (requests.length > 0) {
                yield { type: 'approval-required', requests };
                break;
            }

            // The runner memoises this per iteration and clears the memo at the
            // top of the next one, so each tool runs exactly once whether it is
            // called here or by the runner.
            const toolResult = await runner.generateToolResponse();
            if (toolResult !== null) {
                const answered = toChatMessage(toolResult);
                turns.push(answered);
                await persist();
                yield { type: 'message', message: answered };
            }
        }
    } catch (error) {
        yield { type: 'error', error: errorMessage(error) };
    }
    yield { type: 'done' };
}

/** Narrow a runner message to a chat message, spelling string content out as a block. */
function toChatMessage(param: BetaMessageParam): ChatMessage {
    return {
        // `BetaMessageParam` also allows `system`; a tool response is a user turn.
        role: param.role === 'assistant' ? 'assistant' : 'user',
        content:
            typeof param.content === 'string'
                ? [{ type: 'text', text: param.content }]
                : param.content,
    };
}
