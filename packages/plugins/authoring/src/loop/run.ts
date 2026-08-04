/**
 * The server-side model loop: assembles one request, runs the Anthropic tool
 * runner, and yields the chat events the SSE route writes to the browser.
 */

import { Anthropic } from '@anthropic-ai/sdk';
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta';
import type { AIContextItem, PluginLogger, ToolDefinition } from 'astromech';
import { buildRequest } from './request.js';
import { TOOL_SEARCH, toRunnableTools } from './tools.js';
import { errorMessage } from '../error-message.js';
import type { ChatEvent, ChatMessage, ResolvedAuthoringOptions } from '../types.js';

const MAX_TOKENS = 4096;

/** Bounded so a looping model cannot spend a request forever. */
const MAX_ITERATIONS = 12;

/** Run one chat turn, yielding text as it streams and the tools that ran. */
export async function* runAuthoringLoop(input: {
    apiKey: string;
    options: ResolvedAuthoringOptions;
    tools: ToolDefinition[];
    messages: ChatMessage[];
    aiContext: AIContextItem[];
    logger: PluginLogger;
}): AsyncGenerator<ChatEvent> {
    try {
        const runnableTools = toRunnableTools(input.tools);
        input.logger.info(
            `Chat request running against ${runnableTools.length} tools, found by search`
        );

        const { system, messages } = buildRequest(input.messages, input.aiContext);
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
            yield {
                type: 'message',
                message: { role: 'assistant', content: message.content },
            };

            // The runner memoises this per iteration and clears the memo at the
            // top of the next one, so each tool runs exactly once whether it is
            // called here or by the runner. This is where a confirm gate for a
            // mutating call will intercept.
            const toolResult = await runner.generateToolResponse();
            if (toolResult !== null)
                yield { type: 'message', message: toChatMessage(toolResult) };
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
