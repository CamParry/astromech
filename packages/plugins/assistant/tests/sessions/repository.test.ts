/**
 * Session storage on the harness database: one row per user, replaced, and the
 * size cap that skips a write rather than trimming one.
 */

import type { ChatMessage } from '../../src/types';
import type { PluginTestApp } from '@tests/plugin-app';
import { makeTestConfig } from '@tests/harness';
import { createPluginTestApp } from '@tests/plugin-app';
import { createRepository } from 'astromech';
import { beforeEach, describe, expect, it } from 'vitest';
import { assistant } from '../../src/index';
import {
    createSessionsRepository,
    MAX_SESSION_CHARS,
} from '../../src/sessions/repository';
import { sessionsTable } from '../../src/tables/sessions';

/** One turn of `size` characters of text. */
function turnOf(size: number): ChatMessage {
    return { role: 'user', content: [{ type: 'text', text: 'x'.repeat(size) }] };
}

const TRANSCRIPT: ChatMessage[] = [
    { role: 'user', content: [{ type: 'text', text: 'list the pages' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'There are three.' }] },
];

let app: PluginTestApp<'assistant'>;
let userId: string;
let otherUserId: string;

beforeEach(async () => {
    app = await createPluginTestApp('assistant', {
        ...makeTestConfig(),
        plugins: [assistant()],
    });
    userId = (await createUser()).id;
    otherUserId = (await createUser()).id;
});

/** A user the sessions table's reference can point at. */
function createUser() {
    return app.users.create({
        data: { email: `${crypto.randomUUID()}@test.dev`, name: 'Test User' },
    });
}

describe('createSessionsRepository', () => {
    it('reads back nothing for a user who has never had a conversation', async () => {
        await expect(
            createSessionsRepository(app.db).findByUser(userId)
        ).resolves.toBeNull();
    });

    it('round-trips a transcript through upsert and findByUser', async () => {
        const storage = createSessionsRepository(app.db);

        await expect(storage.upsert(userId, TRANSCRIPT)).resolves.toBe(true);

        await expect(storage.findByUser(userId)).resolves.toEqual(TRANSCRIPT);
    });

    it('replaces the row rather than adding to it', async () => {
        const storage = createSessionsRepository(app.db);
        await storage.upsert(userId, TRANSCRIPT);

        await storage.upsert(userId, [TRANSCRIPT[0] as ChatMessage]);

        expect(await createRepository(sessionsTable, app.db).count()).toBe(1);
        await expect(storage.findByUser(userId)).resolves.toEqual([TRANSCRIPT[0]]);
    });

    it('keeps a transcript to the user it belongs to', async () => {
        const storage = createSessionsRepository(app.db);
        await storage.upsert(userId, TRANSCRIPT);

        await expect(storage.findByUser(otherUserId)).resolves.toBeNull();
    });

    it('clears the row, leaving the next turn to start a new conversation', async () => {
        const storage = createSessionsRepository(app.db);
        await storage.upsert(userId, TRANSCRIPT);

        await storage.deleteByUser(userId);

        await expect(storage.findByUser(userId)).resolves.toBeNull();
    });

    it('skips the write past the cap, leaving the previous transcript in place', async () => {
        const storage = createSessionsRepository(app.db);
        await storage.upsert(userId, TRANSCRIPT);

        await expect(storage.upsert(userId, [turnOf(MAX_SESSION_CHARS)])).resolves.toBe(
            false
        );

        await expect(storage.findByUser(userId)).resolves.toEqual(TRANSCRIPT);
    });
});
