/**
 * Session storage against a stand-in for `createStorage`: one row per user,
 * replaced, and the size cap that skips a write rather than trimming one.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_SESSION_CHARS, createSessionsStorage } from '../../src/sessions/storage.js';
import type { ChatMessage } from '../../src/types.js';

type StoredRow = { userId: string; messages: ChatMessage[] };

const { table } = vi.hoisted(() => ({ table: new Map<string, StoredRow>() }));

vi.mock('astromech', () => ({
    definePluginTable: (_package: string, name: string) => ({
        name: `plugin_authoring_${name}`,
        columns: {},
        indexes: [],
    }),
    createStorage: () => ({
        findOne: (where: { userId: string }) =>
            Promise.resolve(table.get(where.userId) ?? null),
        upsert: (data: StoredRow) => {
            table.set(data.userId, data);
            return Promise.resolve(data);
        },
        deleteMany: (where: { userId: string }) =>
            Promise.resolve(table.delete(where.userId) ? 1 : 0),
    }),
}));

/** The db handle is never touched here — `createStorage` is stood in for. */
const db = {} as Parameters<typeof createSessionsStorage>[0];

/** One turn of `size` characters of text. */
function turnOf(size: number): ChatMessage {
    return { role: 'user', content: [{ type: 'text', text: 'x'.repeat(size) }] };
}

const TRANSCRIPT: ChatMessage[] = [
    { role: 'user', content: [{ type: 'text', text: 'list the pages' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'There are three.' }] },
];

beforeEach(() => {
    table.clear();
});

describe('createSessionsStorage', () => {
    it('reads back nothing for a user who has never had a conversation', async () => {
        await expect(createSessionsStorage(db).load('user_1')).resolves.toBeNull();
    });

    it('round-trips a transcript through save and load', async () => {
        const storage = createSessionsStorage(db);

        await expect(storage.save('user_1', TRANSCRIPT)).resolves.toBe(true);

        await expect(storage.load('user_1')).resolves.toEqual(TRANSCRIPT);
    });

    it('replaces the row rather than adding to it', async () => {
        const storage = createSessionsStorage(db);
        await storage.save('user_1', TRANSCRIPT);

        await storage.save('user_1', [TRANSCRIPT[0] as ChatMessage]);

        expect(table.size).toBe(1);
        await expect(storage.load('user_1')).resolves.toEqual([TRANSCRIPT[0]]);
    });

    it('keeps a transcript to the user it belongs to', async () => {
        const storage = createSessionsStorage(db);
        await storage.save('user_1', TRANSCRIPT);

        await expect(storage.load('user_2')).resolves.toBeNull();
    });

    it('clears the row, leaving the next turn to start a new conversation', async () => {
        const storage = createSessionsStorage(db);
        await storage.save('user_1', TRANSCRIPT);

        await storage.clear('user_1');

        await expect(storage.load('user_1')).resolves.toBeNull();
    });

    it('skips the write past the cap, leaving the previous transcript in place', async () => {
        const storage = createSessionsStorage(db);
        await storage.save('user_1', TRANSCRIPT);

        await expect(storage.save('user_1', [turnOf(MAX_SESSION_CHARS)])).resolves.toBe(
            false
        );

        await expect(storage.load('user_1')).resolves.toEqual(TRANSCRIPT);
    });
});
