/**
 * The chat route, mounted at `/api/plugins/authoring/chat`. It streams the
 * model loop back as server-sent events, which RPC-JSON cannot carry.
 */

import type { AIContextEntry, PluginContext, PluginRawRoute } from 'astromech';
import type {
    ChatEvent,
    ChatMessage,
    ChatRequest,
    ResolvedAuthoringOptions,
} from '../types.js';

/** The plugin's raw routes: the streaming chat endpoint. */
export function chatRoutes(options: ResolvedAuthoringOptions): PluginRawRoute[] {
    return [
        {
            method: 'POST',
            path: '/chat',
            access: { permission: 'use' },
            handler: (request, ctx) => handleChat(request, ctx, options),
        },
    ];
}

/** Validate the posted turn and stream the loop's events back. */
async function handleChat(
    request: Request,
    ctx: PluginContext,
    options: ResolvedAuthoringOptions
): Promise<Response> {
    // A site without a key gets a failed request, not a failed boot.
    const apiKey = ctx.env[options.apiKeyEnv];
    if (apiKey === undefined || apiKey === '') {
        return Response.json(
            { error: `The authoring assistant needs ${options.apiKeyEnv} set.` },
            { status: 503 }
        );
    }

    const body = await readChatRequest(request);
    if (body === null) {
        return Response.json(
            { error: 'Expected { messages: [{ role, content }], aiContext?: [] }' },
            { status: 400 }
        );
    }

    // Imported at request time, never at module load: a static import would pull
    // `@anthropic-ai/sdk` into every load of a site's config, which Astro does
    // in plain Node before anything has asked for a chat.
    const { runAuthoringLoop } = await import('../loop/run.js');

    const events = runAuthoringLoop({
        apiKey,
        options,
        dispatches: ctx.methods.tools({ readOnly: options.readOnly }),
        messages: body.messages,
        aiContext: body.aiContext ?? [],
        logger: ctx.logger,
    });

    return new Response(toEventStream(events), {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive',
        },
    });
}

/**
 * Parse the browser's body, or null when it is not a chat request. The
 * `aiContext` items stay unchecked past being an array: `formatAIContextMessage`
 * sanitises every value it interpolates.
 */
export async function readChatRequest(request: Request): Promise<ChatRequest | null> {
    let parsed: unknown;
    try {
        parsed = await request.json();
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null) return null;

    const { messages, aiContext } = parsed as { messages?: unknown; aiContext?: unknown };
    if (!isChatMessages(messages)) return null;
    if (aiContext === undefined) return { messages };
    if (!Array.isArray(aiContext)) return null;
    return { messages, aiContext: aiContext as AIContextEntry[] };
}

/** Is this an array of `{ role, content }` turns? */
function isChatMessages(value: unknown): value is ChatMessage[] {
    return Array.isArray(value) && value.every(isChatMessage);
}

/** Is this one `{ role: 'user' | 'assistant', content: string }` turn? */
function isChatMessage(value: unknown): value is ChatMessage {
    if (typeof value !== 'object' || value === null) return false;
    const { role, content } = value as { role?: unknown; content?: unknown };
    return (role === 'user' || role === 'assistant') && typeof content === 'string';
}

/** Serialise the loop's events as SSE frames. */
function toEventStream(events: AsyncGenerator<ChatEvent>): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            const next = await events.next();
            if (next.done === true) {
                controller.close();
                return;
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(next.value)}\n\n`));
        },
        async cancel() {
            await events.return(undefined);
        },
    });
}
