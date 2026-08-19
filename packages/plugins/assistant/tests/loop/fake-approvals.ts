/**
 * An in-memory stand-in for the approvals table. `claim` answers a row in the
 * same act as taking it, and applies the same ownership / pending /
 * not-expired filter the SQL does — that filter is what the resume path's
 * refusals are made of, and taking a row is what stops it running twice.
 */

import type { ApprovalsStorage, ClaimedApproval } from '../../src/approvals/storage';
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
    storage: ApprovalsStorage;
    rows: ApprovalRow[];
};

/** Storage backed by `rows`, which the caller reads back to assert on writes. */
export function fakeApprovals(seed: ApprovalRow[] = []): FakeApprovals {
    const rows = [...seed];
    let minted = 0;

    const storage: ApprovalsStorage = {
        mint: vi.fn(async (drafts) =>
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
        claim: vi.fn(async (decisions, userId) => {
            const won: ClaimedApproval[] = [];
            for (const { approvalId, action } of decisions) {
                const row = rows.find((candidate) => candidate.id === approvalId);
                if (row === undefined) continue;
                if (row.userId !== userId || row.status !== 'pending') continue;
                if (row.expiresAt.getTime() <= Date.now()) continue;

                const args = row.arguments ?? {};
                row.status = action === 'approve' ? 'approved' : 'rejected';
                row.resolvedAt = new Date();
                row.arguments = null;
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
        expireStale: vi.fn(async (userId) => {
            for (const row of rows) {
                if (row.userId !== userId || row.status !== 'pending') continue;
                if (row.expiresAt.getTime() > Date.now()) continue;
                row.status = 'expired';
                row.arguments = null;
            }
        }),
        findPending: vi.fn(async (userId) =>
            rows.filter((row) => answerable(row, userId))
        ),
        rejectPending: vi.fn(async (userId) => {
            for (const row of rows) {
                if (!answerable(row, userId)) continue;
                row.status = 'rejected';
                row.resolvedAt = new Date();
                row.arguments = null;
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
