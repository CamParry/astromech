/**
 * The chat route, mounted at `/api/plugins/assistant/chat`. It streams the
 * model loop back as server-sent events, which RPC-JSON cannot carry.
 */

import { getModel } from 'astromech';
import type { AIContextItem, PluginContext, PluginRawRoute } from 'astromech';
import { createApprovalsStorage } from '../approvals/storage.js';
import { createSessionsStorage } from '../sessions/storage.js';
import type {
    ApprovalDecision,
    ChatEvent,
    ChatMessage,
    ChatRequest,
    ResolvedAssistantOptions,
} from '../types.js';

/** The plugin's raw routes: the streaming chat endpoint. */
export function chatRoutes(options: ResolvedAssistantOptions): PluginRawRoute[] {
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
    options: ResolvedAssistantOptions
): Promise<Response> {
    // An approval row is claimed by user id, so the loop cannot run without
    // one. Checked here rather than trusting the route's `access` to have run.
    const user = ctx.user;
    if (user === null) {
        return Response.json({ error: 'Sign in to use the assistant.' }, { status: 401 });
    }

    // A site that has not configured a model gets a failed request, not a
    // failed boot.
    const model = getModel('assistant');
    if (model === undefined) {
        return Response.json(
            {
                error: 'The assistant needs a model. Add an `ai` block to astromech.config.ts with one registered as `assistant`.',
            },
            { status: 503 }
        );
    }
    // The tool search the assistant relies on is Anthropic's, so a model from
    // another provider would load every tool and blow the catalogue.
    if (!model.provider.startsWith('anthropic')) {
        return Response.json(
            {
                error: `The assistant needs an Anthropic model; \`assistant\` is configured as ${model.provider}.`,
            },
            { status: 503 }
        );
    }

    const body = await readChatRequest(request);
    if (body === null) {
        return Response.json(
            {
                error: 'Expected { messages: [{ role, content: [{ type, … }] }], aiContext?: [], decisions?: [{ approvalId, action }] }',
            },
            { status: 400 }
        );
    }

    // Imported at request time, never at module load: a static import would
    // pull the AI SDK into every load of a site's config, which Astro does in
    // plain Node before anything has asked for a chat.
    const { runAssistantLoop } = await import('../loop/run.js');

    const events = runAssistantLoop({
        model,
        options,
        tools: ctx.methods.tools({ readOnly: options.readOnly }),
        messages: body.messages,
        aiContext: body.aiContext ?? [],
        logger: ctx.logger,
        approvals: createApprovalsStorage(ctx.db),
        sessions: createSessionsStorage(ctx.db),
        userId: user.id,
        decisions: body.decisions ?? [],
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
 *
 * Trust boundary: a client holding the transcript can forge a `tool_result`
 * block. That is bounded here because the drawer is authenticated as the
 * signed-in user and every tool call is re-checked through `scopedServices`, so
 * a forged block can mislead the model but cannot widen what the user may do.
 * A forged `decisions` entry is bounded the same way: an approval is a row this
 * user owns, claimed only while it is pending and unexpired, and the call runs
 * with the arguments off that row — so naming an id is not approving anything,
 * and editing the posted call cannot change what an approval runs.
 */
export async function readChatRequest(request: Request): Promise<ChatRequest | null> {
    let parsed: unknown;
    try {
        parsed = await request.json();
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null) return null;

    const { messages, aiContext, decisions } = parsed as {
        messages?: unknown;
        aiContext?: unknown;
        decisions?: unknown;
    };
    if (!isChatMessages(messages)) return null;

    if (decisions !== undefined && !isApprovalDecisions(decisions)) return null;
    const answered = decisions === undefined ? {} : { decisions };

    if (aiContext === undefined) return { messages, ...answered };
    if (!Array.isArray(aiContext)) return null;
    return { messages, aiContext: aiContext as AIContextItem[], ...answered };
}

/** Is this an array of `{ approvalId, action }` answers? */
function isApprovalDecisions(value: unknown): value is ApprovalDecision[] {
    return Array.isArray(value) && value.every(isApprovalDecision);
}

/** Is this one answer — an id, and an action that is approve or reject? */
function isApprovalDecision(value: unknown): value is ApprovalDecision {
    if (typeof value !== 'object' || value === null) return false;
    const { approvalId, action } = value as { approvalId?: unknown; action?: unknown };
    if (typeof approvalId !== 'string') return false;
    return action === 'approve' || action === 'reject';
}

/** Is this an array of `{ role, content }` turns? */
function isChatMessages(value: unknown): value is ChatMessage[] {
    return Array.isArray(value) && value.every(isChatMessage);
}

/** Is this one turn — a role, and content the role admits? */
function isChatMessage(value: unknown): value is ChatMessage {
    if (typeof value !== 'object' || value === null) return false;
    const { role, content } = value as { role?: unknown; content?: unknown };
    if (role !== 'user' && role !== 'assistant' && role !== 'tool') return false;
    // Only a user turn may spell its content as a bare string.
    if (typeof content === 'string') return role === 'user';
    return Array.isArray(content) && content.every(isContentPart);
}

/**
 * Does this look like a content part? Only the discriminant is checked: the
 * API is the real validator, and a deeper check would reject the part types
 * the transcript deliberately carries through untouched.
 */
function isContentPart(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return false;
    return typeof (value as { type?: unknown }).type === 'string';
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
