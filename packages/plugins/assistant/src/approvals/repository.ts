/**
 * Approval storage — the one place the approvals table meets the database.
 *
 * A row is the server's record that a mutating call was put to the user, and
 * the only place the arguments it would run with are read back from. The
 * handle is an argument, not a lookup: a plugin is *handed* its database on
 * `ctx.db`.
 */
import type { ApprovalRow, NewApprovalRow } from '../tables/approvals';
import type { ApprovalDecision } from '../types';
import type { PluginContext } from 'astromech';
import { createRepository } from 'astromech';
import { approvalsTable } from '../tables/approvals';

/**
 * How long an approval stays answerable. A pause the user never answers is
 * dead within the session rather than overnight.
 */
export const APPROVAL_TTL_MS = 60 * 60 * 1000;

/** What a caller supplies; storage fills the status and the deadline. */
export type ApprovalDraft = Omit<NewApprovalRow, 'status' | 'expiresAt'>;

/** A row this request won, and the arguments read off it before it was marked. */
export type ClaimedApproval = {
    id: string;
    toolCallId: string;
    method: string;
    action: ApprovalDecision['action'];
    arguments: Record<string, unknown>;
};

export type ApprovalsRepository = ReturnType<typeof createApprovalsRepository>;

export function createApprovalsRepository(db: PluginContext['db']) {
    const repository = createRepository(approvalsTable, db);

    /** Record calls as pending, returning the rows the requests are built from. */
    async function mint(rows: ApprovalDraft[]): Promise<ApprovalRow[]> {
        const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS);
        const minted: ApprovalRow[] = [];
        for (const row of rows) {
            minted.push(
                await repository.create({ ...row, status: 'pending', expiresAt })
            );
        }
        return minted;
    }

    /**
     * Take the rows these decisions name, returning only the ones this request
     * won. Answering a row IS claiming it: one conditional UPDATE per row marks
     * it and drops its arguments, and a row that updated no rows was already
     * taken, expired, or never this user's. Two requests carrying the same
     * decision therefore run the call once, because only one UPDATE can match.
     *
     * The arguments are read before the write, so a won row still carries them.
     * They are not kept: an update's field values may be `private: true`, while
     * the method, target, decision, who and when are the audit-useful part.
     *
     * A crash between winning a row and running its call loses the call. That is
     * the right way round — a write that did not happen beats a delete that
     * happened twice.
     */
    async function claim(
        decisions: ApprovalDecision[],
        userId: string
    ): Promise<ClaimedApproval[]> {
        if (decisions.length === 0) return [];
        const now = new Date();

        const candidates = await repository.findMany({
            where: {
                id: { in: decisions.map(({ approvalId }) => approvalId) },
                ...answerable(userId, now),
            },
        });

        const won: ClaimedApproval[] = [];
        for (const row of candidates) {
            const action =
                decisions.find(({ approvalId }) => approvalId === row.id)?.action ??
                'reject';
            const taken = await repository.updateMany(
                { id: row.id, ...answerable(userId, now) },
                {
                    status: action === 'approve' ? 'approved' : 'rejected',
                    resolvedAt: now,
                    arguments: null,
                }
            );
            if (taken !== 1) continue;
            won.push({
                id: row.id,
                toolCallId: row.toolCallId,
                method: row.method,
                action,
                arguments: row.arguments ?? {},
            });
        }
        return won;
    }

    /**
     * Sweep this user's pending rows that are past their deadline. Called on
     * mint, so an abandoned pause is cleared lazily rather than by a cron.
     */
    async function expireStale(userId: string): Promise<void> {
        await repository.updateMany(
            { userId, status: 'pending', expiresAt: { lt: new Date() } },
            { status: 'expired', arguments: null }
        );
    }

    /**
     * The rows this user could still answer. A reload rebuilds the drawer's
     * held calls from these rather than from a copy in the transcript, so the
     * arguments a click runs with stay the ones on the row.
     */
    async function findPending(userId: string): Promise<ApprovalRow[]> {
        return repository.findMany({ where: answerable(userId, new Date()) });
    }

    /**
     * Turn down every call this user still holds. Starting a new conversation
     * abandons them, which is the rule a new message already follows.
     */
    async function rejectPending(userId: string): Promise<void> {
        const now = new Date();
        await repository.updateMany(answerable(userId, now), {
            status: 'rejected',
            resolvedAt: now,
            arguments: null,
        });
    }

    return { mint, claim, expireStale, findPending, rejectPending };
}

/** The rows a decision may still resolve: this user's, pending, unexpired. */
function answerable(userId: string, now: Date) {
    return { userId, status: 'pending', expiresAt: { gt: now } } as const;
}
