/**
 * The approvals contract, run against the real repository on the harness
 * database and against the in-memory fake the loop's tests use, so the fake
 * cannot drift from the SQL that makes an approval owner-only, unexpired and
 * single-use.
 */

import type { ApprovalsRepository } from '../../src/approvals/repository';
import type { ApprovalRow } from '../../src/tables/approvals';
import type { PluginTestApp } from '@tests/plugin-app';
import { makeTestConfig } from '@tests/harness';
import { createPluginTestApp } from '@tests/plugin-app';
import { createRepository } from 'astromech';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApprovalsRepository } from '../../src/approvals/repository';
import { assistant } from '../../src/index';
import { approvalsTable } from '../../src/tables/approvals';
import { approvalRow, fakeApprovals } from '../loop/fake-approvals';

const HOUR_MS = 60 * 60 * 1000;

/** One implementation of `ApprovalsRepository`, with ways to seed and read its rows. */
type Subject = {
    storage: ApprovalsRepository;
    /** The user the rows under test belong to. */
    owner: string;
    /** Another user, whose rows the owner's calls must leave alone. */
    other: string;
    /** Store `row` as it stands, status and deadline included. */
    seed(row: ApprovalRow): Promise<void>;
    /** Read one row back. */
    find(id: string): Promise<ApprovalRow | undefined>;
};

/** The repository on a fresh harness database, with two real users. */
async function realSubject(): Promise<Subject> {
    const app = await createPluginTestApp('assistant', {
        ...makeTestConfig(),
        plugins: [assistant()],
    });
    const rows = createRepository(approvalsTable, app.db);
    return {
        storage: createApprovalsRepository(app.db),
        owner: (await createUser(app)).id,
        other: (await createUser(app)).id,
        seed: async (row) => {
            await rows.create(row);
        },
        find: async (id) => (await rows.findOne({ id })) ?? undefined,
    };
}

/** The fake the loop's tests use. */
async function fakeSubject(): Promise<Subject> {
    const fake = fakeApprovals();
    return {
        storage: fake.storage,
        owner: 'user_1',
        other: 'user_2',
        seed: async (row) => {
            fake.rows.push(row);
        },
        find: async (id) => fake.rows.find((row) => row.id === id),
    };
}

/** A user the approvals table's reference can point at. */
function createUser(app: PluginTestApp<'assistant'>) {
    return app.users.create({
        data: { email: `${crypto.randomUUID()}@test.dev`, name: 'Test User' },
    });
}

describe.each([
    ['the repository', realSubject],
    ['the fake', fakeSubject],
])('approvals, on %s', (_name, createSubject) => {
    let subject: Subject;

    beforeEach(async () => {
        subject = await createSubject();
    });

    /** A pending row of the owner's, an hour from expiry unless overridden. */
    function row(overrides: Partial<ApprovalRow>): ApprovalRow {
        return approvalRow({ userId: subject.owner, ...overrides });
    }

    /** A deadline `ms` from now; negative for one already past. */
    function inMs(ms: number): Date {
        return new Date(Date.now() + ms);
    }

    it('records each call as pending, answerable for an hour', async () => {
        const before = Date.now();

        const [created] = await subject.storage.createMany([
            {
                userId: subject.owner,
                toolCallId: 'toolu_1',
                method: 'entries.page.update',
                toolName: 'entries_page_update',
                arguments: { id: 'page_1' },
                destructive: true,
            },
        ]);

        expect(created).toMatchObject({
            userId: subject.owner,
            toolCallId: 'toolu_1',
            status: 'pending',
            arguments: { id: 'page_1' },
            destructive: true,
        });
        const stored = await subject.find(created?.id ?? '');
        expect(stored?.status).toBe('pending');
        expect(stored?.expiresAt.getTime()).toBeGreaterThanOrEqual(before + HOUR_MS);
        expect(stored?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + HOUR_MS);
    });

    it("claims the owner's pending row with its arguments, and marks it approved", async () => {
        await subject.seed(row({ id: 'ap_1', arguments: { id: 'page_1' } }));

        const won = await subject.storage.claim(
            [{ approvalId: 'ap_1', action: 'approve' }],
            subject.owner
        );

        expect(won).toEqual([
            {
                id: 'ap_1',
                toolCallId: 'toolu_1',
                method: 'entries.page.update',
                action: 'approve',
                arguments: { id: 'page_1' },
            },
        ]);
        const stored = await subject.find('ap_1');
        expect(stored).toMatchObject({ status: 'approved', arguments: null });
        expect(stored?.resolvedAt).toBeInstanceOf(Date);
    });

    it('marks a turned-down row rejected', async () => {
        await subject.seed(row({ id: 'ap_1' }));

        await subject.storage.claim(
            [{ approvalId: 'ap_1', action: 'reject' }],
            subject.owner
        );

        expect(await subject.find('ap_1')).toMatchObject({
            status: 'rejected',
            arguments: null,
        });
    });

    it('claims a row once, however many times its decision is posted', async () => {
        await subject.seed(row({ id: 'ap_1' }));
        const decisions = [{ approvalId: 'ap_1', action: 'approve' as const }];

        const [first, second] = await Promise.all([
            subject.storage.claim(decisions, subject.owner),
            subject.storage.claim(decisions, subject.owner),
        ]);
        const third = await subject.storage.claim(decisions, subject.owner);

        expect([...(first ?? []), ...(second ?? []), ...third]).toHaveLength(1);
    });

    it.each<[string, (subject: Subject) => Partial<ApprovalRow>]>([
        ['another user holds', ({ other }) => ({ userId: other })],
        ['is past its deadline', () => ({ expiresAt: inMs(-1000) })],
        ['was already answered', () => ({ status: 'approved' })],
    ])('claims nothing from a row that %s', async (_case, change) => {
        await subject.seed(row({ id: 'ap_1', ...change(subject) }));

        const won = await subject.storage.claim(
            [{ approvalId: 'ap_1', action: 'approve' }],
            subject.owner
        );

        expect(won).toEqual([]);
        expect((await subject.find('ap_1'))?.arguments).not.toBeNull();
    });

    it('claims nothing for no decisions or an unknown id', async () => {
        await subject.seed(row({ id: 'ap_1' }));

        await expect(subject.storage.claim([], subject.owner)).resolves.toEqual([]);
        await expect(
            subject.storage.claim(
                [{ approvalId: 'ap_x', action: 'approve' }],
                subject.owner
            )
        ).resolves.toEqual([]);
    });

    it("expires only the owner's pending rows past their deadline", async () => {
        await subject.seed(row({ id: 'ap_stale', expiresAt: inMs(-1000) }));
        await subject.seed(row({ id: 'ap_live' }));
        await subject.seed(
            row({ id: 'ap_other', userId: subject.other, expiresAt: inMs(-1000) })
        );

        await subject.storage.expireStale(subject.owner);

        expect(await subject.find('ap_stale')).toMatchObject({
            status: 'expired',
            arguments: null,
        });
        expect((await subject.find('ap_live'))?.status).toBe('pending');
        expect((await subject.find('ap_other'))?.status).toBe('pending');
    });

    it("lists only the owner's answerable rows as pending", async () => {
        await subject.seed(row({ id: 'ap_live' }));
        await subject.seed(row({ id: 'ap_stale', expiresAt: inMs(-1000) }));
        await subject.seed(row({ id: 'ap_answered', status: 'approved' }));
        await subject.seed(row({ id: 'ap_other', userId: subject.other }));

        const pending = await subject.storage.findPending(subject.owner);

        expect(pending.map(({ id }) => id)).toEqual(['ap_live']);
    });

    it("turns down only the owner's answerable rows", async () => {
        await subject.seed(row({ id: 'ap_live' }));
        await subject.seed(row({ id: 'ap_stale', expiresAt: inMs(-1000) }));
        await subject.seed(row({ id: 'ap_other', userId: subject.other }));

        await subject.storage.rejectPending(subject.owner);

        const rejected = await subject.find('ap_live');
        expect(rejected).toMatchObject({ status: 'rejected', arguments: null });
        expect(rejected?.resolvedAt).toBeInstanceOf(Date);
        expect((await subject.find('ap_stale'))?.status).toBe('pending');
        expect((await subject.find('ap_other'))?.status).toBe('pending');
    });
});
