/**
 * The plugin's two session methods, called through the registered service as a
 * signed-in user: what a reload reads back, and what starting a new
 * conversation does to the calls the last one left held.
 */

import type { ChatMessage, ResolvedAssistantOptions } from '../../src/types';
import type { User } from '@/types/index';
import type { PluginTestApp } from '@tests/plugin-app';
import { roleWith } from '@tests/fixtures';
import { makeTestConfig } from '@tests/harness';
import { createPluginTestApp } from '@tests/plugin-app';
import { methodInputs, openInputObjects } from '@tests/strict-input';
import { createRepository } from 'astromech';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApprovalsRepository } from '../../src/approvals/repository';
import { assistant } from '../../src/index';
import { createSessionsService } from '../../src/service/sessions';
import { createSessionsRepository } from '../../src/sessions/repository';
import { approvalsTable } from '../../src/tables/approvals';

const OPTIONS: ResolvedAssistantOptions = {
    effort: 'medium',
    readOnly: false,
};

const TRANSCRIPT: ChatMessage[] = [
    { role: 'user', content: [{ type: 'text', text: 'update home' }] },
];

/** Uses the assistant and may update posts, so a held update keeps its tool. */
const ROLE = roleWith([...assistant.permissions('use'), 'entry:*']);

let app: PluginTestApp<'assistant'>;
let user: User;
let otherUser: User;

beforeEach(async () => {
    app = await createPluginTestApp('assistant', {
        ...makeTestConfig(),
        plugins: [assistant()],
    });
    user = await createUser();
    otherUser = await createUser();
});

/** A user the plugin's tables can reference. */
function createUser(): Promise<User> {
    return app.users.create({
        data: { email: `${crypto.randomUUID()}@test.dev`, name: 'Test User' },
    });
}

/** Hold one update of post `post_1` for `owner`, as a paused turn does. */
async function holdUpdate(owner: User): Promise<string> {
    const [row] = await createApprovalsRepository(app.db).createMany([
        {
            userId: owner.id,
            toolCallId: 'toolu_1',
            method: 'entries.post.update',
            toolName: 'entries_post_update',
            arguments: { type: 'post', id: 'post_1', data: { title: 'From the row' } },
            destructive: false,
        },
    ]);
    if (row === undefined) throw new Error('no approval row was created');
    return row.id;
}

describe('getSession', () => {
    it('answers an empty session for a user who has never had one', async () => {
        await expect(app.as(ROLE, user).getSession()).resolves.toEqual({
            messages: [],
            pending: [],
        });
    });

    it('reads back the stored transcript', async () => {
        await createSessionsRepository(app.db).upsert(user.id, TRANSCRIPT);

        await expect(app.as(ROLE, user).getSession()).resolves.toEqual({
            messages: TRANSCRIPT,
            pending: [],
        });
    });

    it('rebuilds the held calls from their rows, arguments and wording intact', async () => {
        const approvalId = await holdUpdate(user);

        const session = await app.as(ROLE, user).getSession();

        expect(session.pending).toEqual([
            {
                approvalId,
                toolCallId: 'toolu_1',
                method: 'entries.post.update',
                toolName: 'entries_post_update',
                // Core's own wording: the fallback would be `Run "entries.post.update"?`.
                message:
                    'Run "entries.post.update" on type "post", id "post_1"? This changes stored data.',
                destructive: false,
                arguments: {
                    type: 'post',
                    id: 'post_1',
                    data: { title: 'From the row' },
                },
            },
        ]);
    });

    it('leaves the calls another user is holding alone', async () => {
        await holdUpdate(otherUser);

        const session = await app.as(ROLE, user).getSession();

        expect(session.pending).toEqual([]);
    });

    it('refuses a caller with no identity', async () => {
        await expect(app.as(ROLE, null).getSession()).rejects.toThrow('Sign in');
    });

    it('drops keys a held call does not name, and passes each message through whole', () => {
        const message = {
            role: 'assistant',
            content: [{ type: 'reasoning', text: 'thinking', providerOptions: { a: 1 } }],
        };
        const request = {
            approvalId: 'ap_1',
            toolCallId: 'toolu_1',
            method: 'entries.page.update',
            toolName: 'entries_page_update',
            message: 'Update the page "Home"?',
            destructive: false,
            arguments: { id: 'page_1' },
        };

        expect(
            createSessionsService(OPTIONS).getSession.output.parse({
                messages: [message],
                pending: [{ ...request, userId: 'user_1' }],
            })
        ).toEqual({ messages: [message], pending: [request] });
    });
});

describe('clearSession', () => {
    it('drops the stored transcript', async () => {
        const sessions = createSessionsRepository(app.db);
        await sessions.upsert(user.id, TRANSCRIPT);

        await app.as(ROLE, user).clearSession();

        await expect(sessions.findByUser(user.id)).resolves.toBeNull();
    });

    it('turns down every call the conversation left held', async () => {
        const approvalId = await holdUpdate(user);

        await app.as(ROLE, user).clearSession();

        const row = await createRepository(approvalsTable, app.db).findOne({
            id: approvalId,
        });
        expect(row?.status).toBe('rejected');
        expect(row?.arguments).toBeNull();
    });

    it('refuses a caller with no identity', async () => {
        await expect(app.as(ROLE, null).clearSession()).rejects.toThrow('Sign in');
    });
});

describe('method inputs', () => {
    it("refuse unknown keys, as core's do", () => {
        const inputs = methodInputs(createSessionsService(OPTIONS));

        expect(Object.keys(inputs).length).toBeGreaterThan(0);
        expect(openInputObjects(inputs)).toEqual([]);
    });
});
