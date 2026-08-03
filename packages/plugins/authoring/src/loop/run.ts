/**
 * The server-side model loop: assembles one request, runs the Anthropic tool
 * runner, and yields the chat events the SSE route writes to the browser.
 */

import { Anthropic } from '@anthropic-ai/sdk';
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta';
import { formatAIContextMessage } from 'astromech/methods';
import type { AIContextEntry } from 'astromech/methods';
import type { PluginLogger, Role } from 'astromech';
import { buildAuthoringTools } from './tools.js';
import type { ChatEvent, ChatMessage, ResolvedAuthoringOptions } from '../types.js';

const SYSTEM_PROMPT = `You are the authoring assistant inside the Astromech admin.
You help the signed-in user find, understand and work on their site's content.
You can only see and do what their role permits: the tools you hold are the whole
of your reach, and a refused call means the user lacks that permission.
Say plainly when you cannot do something rather than guessing, and never invent
content you have not read.
Keep answers short and concrete.`;

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

/**
 * The system prompt and turns to send. AI context goes immediately before the
 * final user turn, which keeps it after the last cache breakpoint so navigating
 * does not invalidate the cached prefix. A system message may not be
 * `messages[0]`, so on the opening turn it rides in the system prompt instead —
 * there is no cached prefix yet for it to cost anything.
 */
function buildRequest(
    messages: ChatMessage[],
    aiContext: AIContextEntry[]
): { system: string; messages: BetaMessageParam[] } {
    const turns: BetaMessageParam[] = messages.map((message) => ({
        role: message.role,
        content: message.content,
    }));
    const context = formatAIContextMessage(aiContext);
    if (context === null) return { system: SYSTEM_PROMPT, messages: turns };

    const last = turns.length - 1;
    if (last < 1 || turns[last]?.role !== 'user') {
        return { system: `${SYSTEM_PROMPT}\n\n${context.content}`, messages: turns };
    }

    turns.splice(last, 0, context);
    return { system: SYSTEM_PROMPT, messages: turns };
}

/** The message of a thrown value, and nothing else about it. */
function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
