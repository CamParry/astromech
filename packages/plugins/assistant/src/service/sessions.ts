/**
 * Service methods for @astromech/assistant — reading back the signed-in user's
 * chat session and replacing it. Only the chat endpoint itself streams, so it
 * stays a raw route; these are plain JSON and belong here, where they are
 * typed, callable off `useAstromechPlugin().service`, and visible to the method
 * manifest.
 */

import type { ChatMessage, ResolvedAssistantOptions } from '../types';
import { defineServiceMethod, noInput, z } from 'astromech';
import { createApprovalsRepository } from '../approvals/repository';
import { toApprovalRequest } from '../approvals/request';
import { createSessionsRepository } from '../sessions/repository';

/** One call held back for a human decision (`ApprovalRequest`). */
export const approvalRequestSchema = z.object({
    approvalId: z.string(),
    toolCallId: z.string(),
    method: z.string(),
    toolName: z.string(),
    message: z.string(),
    destructive: z.boolean(),
    arguments: z.record(z.string(), z.unknown()),
});

/**
 * A user's conversation. `pending` is read off the approvals table rather than
 * stored with the transcript — the rows are what a click resolves, so a reload
 * mid-pause restores the buttons instead of dropping the calls behind them.
 */
const chatSessionSchema = z.object({
    // Checked to be an object and not walked: every part goes back to the
    // provider verbatim, keys this plugin does not know included.
    messages: z.array(
        z
            .custom<ChatMessage>((value) => typeof value === 'object' && value !== null, {
                message: 'Expected a chat message',
            })
            .openapi({ type: 'object', additionalProperties: true })
    ),
    pending: z.array(approvalRequestSchema),
});

export type ChatSession = z.output<typeof chatSessionSchema>;

/** The `getSession` / `clearSession` service methods for the signed-in user's chat. */
export function createSessionsService(options: ResolvedAssistantOptions) {
    return {
        getSession: defineServiceMethod({
            access: { permission: 'use' },
            summary: 'Read back the signed-in user’s conversation with the assistant.',
            input: noInput(),
            output: chatSessionSchema,
            mutates: false,
            handler: async (_input, ctx): Promise<ChatSession> => {
                const userId = actingUserId(ctx.user);
                const approvals = createApprovalsRepository(ctx.db);
                const held = await approvals.findPending(userId);
                // Only a held call needs the tool that worded it, and building
                // the surface composes the whole manifest.
                const tools =
                    held.length === 0
                        ? []
                        : ctx.methods.tools({ readOnly: options.readOnly });
                return {
                    messages:
                        (await createSessionsRepository(ctx.db).findByUser(userId)) ?? [],
                    pending: held.map((row) => toApprovalRequest(row, tools)),
                };
            },
        }),

        // Answers `null`: there is no result, and that is what RPC puts on the
        // wire for a handler that returns nothing.
        clearSession: defineServiceMethod({
            access: { permission: 'use' },
            summary: 'Discard the conversation and start a new one.',
            input: noInput(),
            output: z.null(),
            mutates: true,
            destructive: false,
            handler: async (_input, ctx): Promise<null> => {
                const userId = actingUserId(ctx.user);
                await createSessionsRepository(ctx.db).deleteByUser(userId);
                // A conversation nobody will answer must leave no held rows, the
                // same rule a new message already applies.
                await createApprovalsRepository(ctx.db).rejectPending(userId);
                return null;
            },
        }),
    };
}

/** A session belongs to a user id, so there is nothing to do without one. */
function actingUserId(user: { id: string } | null): string {
    if (user === null) throw new Error('Sign in to use the assistant.');
    return user.id;
}
