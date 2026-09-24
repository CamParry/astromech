/**
 * An in-memory stand-in for the approvals table. `claim` answers a row in the
 * same act as taking it, and applies the same ownership / pending /
 * not-expired filter the SQL does — that filter is what the resume path's
 * refusals are made of, and taking a row is what stops it running twice.
 */

import type {
    ApprovalsRepository,
    ClaimedApproval,
} from '../../src/approvals/repository';
import type { ApprovalRow } from '../../src/tables/approvals';
import { vi } from 'vitest';

const HOUR_MS = 60 * 60 * 1000;

/** A pending row, an hour from expiry unless overridden. */
export function approvalRow(overrides: Partial<ApprovalRow> = {}): ApprovalRow {
    return {
        id: 'ap_1',
        userId: 'user_1',
        toolCallId: 'toolu_1',
        method: 'entries.page.update',
        toolName: 'entries_page_update',
        arguments: { id: 'page_1', fields: { title: 'From the row' } },
        destructive: false,
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + HOUR_MS),
        resolvedAt: null,
        ...overrides,
    };
}

export type FakeApprovals = {
    storage: ApprovalsRepository;
    rows: ApprovalRow[];
};

/**
 * Storage backed by `rows`, which the caller reads back to assert on writes. A
 * write replaces the row rather than changing it, so read results from `rows`,
 * not from a row passed in as `seed`.
 */
export function fakeApprovals(seed: ApprovalRow[] = []): FakeApprovals {
    const rows = [...seed];
    let minted = 0;

    const storage: ApprovalsRepository = {
        createMany: vi.fn<ApprovalsRepository['createMany']>(async (drafts) =>
            drafts.map((draft) => {
                minted += 1;
                const row = approvalRow({
                    ...draft,
                    id: `minted_${minted}`,
                    status: 'pending',
                });
                rows.push(row);
                return row;
            })
        ),
        claim: vi.fn<ApprovalsRepository['claim']>(async (decisions, userId) => {
            const won: ClaimedApproval[] = [];
            for (const { approvalId, action } of decisions) {
                const index = rows.findIndex((candidate) => candidate.id === approvalId);
                const row = rows[index];
                if (row === undefined) continue;
                if (row.userId !== userId || row.status !== 'pending') continue;
                if (row.expiresAt.getTime() <= Date.now()) continue;

                const args = row.arguments ?? {};
                rows[index] = {
                    ...row,
                    status: action === 'approve' ? 'approved' : 'rejected',
                    resolvedAt: new Date(),
                    arguments: null,
                };
                won.push({
                    id: row.id,
                    toolCallId: row.toolCallId,
                    method: row.method,
                    action,
                    arguments: args,
                });
            }
            return won;
        }),
        expireStale: vi.fn<ApprovalsRepository['expireStale']>(async (userId) => {
            for (const [index, row] of rows.entries()) {
                if (row.userId !== userId || row.status !== 'pending') continue;
                if (row.expiresAt.getTime() > Date.now()) continue;
                rows[index] = { ...row, status: 'expired', arguments: null };
            }
        }),
        findPending: vi.fn<ApprovalsRepository['findPending']>(async (userId) =>
            rows.filter((row) => answerable(row, userId))
        ),
        rejectPending: vi.fn<ApprovalsRepository['rejectPending']>(async (userId) => {
            for (const [index, row] of rows.entries()) {
                if (!answerable(row, userId)) continue;
                rows[index] = {
                    ...row,
                    status: 'rejected',
                    resolvedAt: new Date(),
                    arguments: null,
                };
            }
        }),
    };

    return { storage, rows };
}

/** The SQL predicate the storage matches on: this user's, pending, unexpired. */
function answerable(row: ApprovalRow, userId: string): boolean {
    return (
        row.userId === userId &&
        row.status === 'pending' &&
        row.expiresAt.getTime() > Date.now()
    );
}
