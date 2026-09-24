/**
 * The plugin's two session methods: what a reload reads back, and what starting
 * a new conversation does to the calls the last one left held.
 */

import type { ChatSession } from '../../src/service/sessions';
import type { ChatMessage, ResolvedAssistantOptions } from '../../src/types';
import type { FakeApprovals } from '../loop/fake-approvals';
import type { FakeSessions } from '../sessions/fake-sessions';
import type { ToolDefinition } from 'astromech';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionsService } from '../../src/service/sessions';
import { approvalRow, fakeApprovals } from '../loop/fake-approvals';
import { fakeSessions } from '../sessions/fake-sessions';

vi.mock('astromech', () => ({
    defineServiceMethod: (method: unknown) => method,
    noInput: () => undefined,
}));

vi.mock('../../src/sessions/repository', () => ({
    createSessionsRepository: () => sessions.storage,
}));

vi.mock('../../src/approvals/repository', () => ({
    createApprovalsRepository: () => approvals.storage,
}));

const OPTIONS: ResolvedAssistantOptions = {
    effort: 'medium',
    readOnly: false,
};

const TRANSCRIPT: ChatMessage[] = [
    { role: 'user', content: [{ type: 'text', text: 'update home' }] },
];

/** The update tool, so a restored request carries core's own wording. */
const UPDATE: ToolDefinition = {
    name: 'entries_page_update',
    id: 'entries.page.update',
    description: 'Updates a page.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    permission: null,
    permissionDynamic: false,
    confirmMessage: () => 'Update the page "Home"?',
    invoke: vi.fn(),
};

let sessions: FakeSessions;
let approvals: FakeApprovals;

/** What a session method's handler is called with. */
type HandlerContext = Parameters<
    ReturnType<typeof createSessionsService>['getSession']['handler']
>[1];

/** A request context for `user`, carrying the one tool the fixtures name. */
function context(user: { id: string } | null): HandlerContext {
    return {
        db: {},
        user,
        methods: { tools: () => [UPDATE] },
    } as unknown as HandlerContext;
}

/** Call one of the two methods with no input. */
function call<K extends 'getSession' | 'clearSession'>(
    method: K,
    user: { id: string } | null
): Promise<ChatSession | null> {
    return Promise.resolve(
        createSessionsService(OPTIONS)[method].handler(undefined, context(user))
    );
}

beforeEach(() => {
    sessions = fakeSessions();
    approvals = fakeApprovals();
});

describe('getSession', () => {
    it('answers an empty session for a user who has never had one', async () => {
        await expect(call('getSession', { id: 'user_1' })).resolves.toEqual({
            messages: [],
            pending: [],
        });
    });

    it('reads back the stored transcript', async () => {
        await sessions.storage.upsert('user_1', TRANSCRIPT);

        await expect(call('getSession', { id: 'user_1' })).resolves.toEqual({
            messages: TRANSCRIPT,
            pending: [],
        });
    });

    it('rebuilds the held calls from their rows, arguments and wording intact', async () => {
        approvals.rows.push(approvalRow());

        const session = (await call('getSession', { id: 'user_1' })) as ChatSession;

        expect(session.pending).toEqual([
            {
                approvalId: 'ap_1',
                toolCallId: 'toolu_1',
                method: 'entries.page.update',
                toolName: 'entries_page_update',
                message: 'Update the page "Home"?',
                destructive: false,
                arguments: { id: 'page_1', fields: { title: 'From the row' } },
            },
        ]);
    });

    it('leaves the calls another user is holding alone', async () => {
        approvals.rows.push(approvalRow({ userId: 'user_2' }));

        const session = (await call('getSession', { id: 'user_1' })) as ChatSession;

        expect(session.pending).toEqual([]);
    });

    it('refuses a caller with no identity', async () => {
        await expect(call('getSession', null)).rejects.toThrow('Sign in');
    });
});

describe('clearSession', () => {
    it('drops the stored transcript', async () => {
        await sessions.storage.upsert('user_1', TRANSCRIPT);

        await call('clearSession', { id: 'user_1' });

        await expect(sessions.storage.findByUser('user_1')).resolves.toBeNull();
    });

    it('turns down every call the conversation left held', async () => {
        approvals.rows.push(approvalRow());

        await call('clearSession', { id: 'user_1' });

        expect(approvals.rows[0]?.status).toBe('rejected');
        expect(approvals.rows[0]?.arguments).toBeNull();
    });

    it('refuses a caller with no identity', async () => {
        await expect(call('clearSession', null)).rejects.toThrow('Sign in');
    });
});
