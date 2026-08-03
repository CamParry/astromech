/**
 * The server-side model loop: assembles one request, runs the Anthropic tool
 * runner, and yields the chat events the SSE route writes to the browser.
 */

import { Anthropic } from '@anthropic-ai/sdk';
import type { AIContextEntry } from 'astromech/methods';
import type { PluginLogger, Role } from 'astromech';
import { buildRequest } from './request.js';
import { buildAuthoringTools } from './tools.js';
import type { ChatEvent, ChatMessage, ResolvedAuthoringOptions } from '../types.js';

const MAX_TOKENS = 4096;

/** Bounded so a looping model cannot spend a request forever. */
const MAX_ITERATIONS = 12;

/** Run one chat turn, yielding text as it streams and the tools that ran. */
export async function* runAuthoringLoop(input: {
    apiKey: string;
    options: ResolvedAuthoringOptions;
    role: Role | null;
    messages: ChatMessage[];
    aiContext: AIContextEntry[];
    logger: PluginLogger;
}): AsyncGenerator<ChatEvent> {
    try {
        const tools = buildAuthoringTools(input.role, input.options);
        input.logger.info(`Chat request running against ${tools.length} tools`);

        const { system, messages } = buildRequest(input.messages, input.aiContext);
        const client = new Anthropic({ apiKey: input.apiKey });
        const runner = client.beta.messages.toolRunner({
            model: input.options.model,
            max_tokens: MAX_TOKENS,
            system,
            output_config: { effort: input.options.effort },
            messages,
            tools,
            stream: true,
            max_iterations: MAX_ITERATIONS,
        });

        for await (const stream of runner) {
            for await (const event of stream) {
                if (
                    event.type === 'content_block_delta' &&
                    event.delta.type === 'text_delta'
                ) {
                    yield { type: 'text', text: event.delta.text };
                }
            }
            // Mandatory every turn: returning from the loop body without
            // awaiting the final message aborts the stream.
            const message = await stream.finalMessage();
            for (const block of message.content) {
                if (block.type === 'tool_use') {
                    yield { type: 'tool', name: block.name };
                }
            }
        }
    } catch (error) {
        yield { type: 'error', message: errorMessage(error) };
    }
    yield { type: 'done' };
}

/** The message of a thrown value, and nothing else about it. */
function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
