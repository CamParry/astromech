/**
 * Service methods for @astromech/authoring — reading back the signed-in user's
 * chat session and replacing it. Only the chat endpoint itself streams, so it
 * stays a raw route; these are plain JSON and belong here, where they are
 * typed, callable off `useAstromechPlugin().service`, and visible to the method
 * manifest.
 */

import { defineServiceMethod, noInput } from 'astromech';
import { toApprovalRequest } from '../approvals/request.js';
import { createApprovalsStorage } from '../approvals/storage.js';
import { createSessionsStorage } from '../sessions/storage.js';
import type { ApprovalRequest, ChatMessage, ResolvedAuthoringOptions } from '../types.js';

/**
 * A user's conversation. `pending` is read off the approvals table rather than
 * stored with the transcript — the rows are what a click resolves, so a reload
 * mid-pause restores the buttons instead of dropping the calls behind them.
 */
export type ChatSession = {
    messages: ChatMessage[];
    pending: ApprovalRequest[];
};

export function buildSessionsService(options: ResolvedAuthoringOptions) {
    return {
        getSession: defineServiceMethod<undefined, ChatSession>({
            access: { permission: 'use' },
            summary: 'Read back the signed-in user’s conversation with the assistant.',
            input: noInput(),
            mutates: false,
            handler: async (_input, ctx): Promise<ChatSession> => {
                const userId = actingUserId(ctx.user);
                const approvals = createApprovalsStorage(ctx.db);
                const held = await approvals.findPending(userId);
                // Only a held call needs the tool that worded it, and building
                // the surface composes the whole manifest.
                const tools =
                    held.length === 0
                        ? []
                        : ctx.methods.tools({ readOnly: options.readOnly });
                return {
                    messages: (await createSessionsStorage(ctx.db).load(userId)) ?? [],
                    pending: held.map((row) => toApprovalRequest(row, tools)),
                };
            },
        }),

        // Answers `null`: there is no result, and that is what RPC puts on the
        // wire for a handler that returns nothing.
        clearSession: defineServiceMethod<undefined, null>({
            access: { permission: 'use' },
            summary: 'Discard the conversation and start a new one.',
            input: noInput(),
            mutates: true,
            destructive: false,
            handler: async (_input, ctx): Promise<null> => {
                const userId = actingUserId(ctx.user);
                await createSessionsStorage(ctx.db).clear(userId);
                // A conversation nobody will answer must leave no held rows, the
                // same rule a new message already applies.
                await createApprovalsStorage(ctx.db).rejectPending(userId);
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
