/**
 * Session storage — the one place the sessions table meets the database.
 *
 * One row per user, replaced in place, holding the transcript the drawer posts
 * back. The handle is an argument, not a lookup: a plugin is *handed* its
 * database on `ctx.db`.
 */

import { createStorage } from 'astromech';
import type { PluginContext } from 'astromech';
import { sessionsTable } from '../tables/sessions.js';
import type { ChatMessage } from '../types.js';

/**
 * A database-row backstop, not a retention policy. The model's context window
 * binds long before this does, so a transcript that reaches it is already
 * unusable as a conversation.
 */
export const MAX_SESSION_CHARS = 512 * 1024;

export type SessionsStorage = ReturnType<typeof createSessionsStorage>;

export function createSessionsStorage(db: PluginContext['db']) {
    const storage = createStorage(sessionsTable, db);

    /** This user's transcript, or null when they have never had one. */
    async function load(userId: string): Promise<ChatMessage[] | null> {
        const row = await storage.findOne({ userId });
        return row === null ? null : row.messages;
    }

    /**
     * Replace this user's transcript. `false` means the transcript was past the
     * cap and nothing was written: the previous, smaller one stays, which is
     * still a valid turn boundary to resume from.
     */
    async function save(userId: string, messages: ChatMessage[]): Promise<boolean> {
        if (JSON.stringify(messages).length > MAX_SESSION_CHARS) return false;
        // `updatedAt` is stamped by the wrapper on both branches — `defaultNow`
        // fills the insert, `onUpdate` fills the conflict update — so it is
        // deliberately absent from both value sets here.
        await storage.upsert(
            { userId, messages },
            { target: ['userId'], set: { messages } }
        );
        return true;
    }

    /** Drop this user's transcript, so the next turn starts a new conversation. */
    async function clear(userId: string): Promise<void> {
        await storage.deleteMany({ userId });
    }

    return { load, save, clear };
}
