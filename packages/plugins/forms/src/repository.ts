/**
 * The forms repositories: the one place the plugin's tables meet the database.
 * Built per call from `ctx.db`, so a transaction scope reaches them.
 */
import type { NewSubmissionRow, SubmissionRow } from './tables/submissions';
import type { PluginContext, Where } from 'astromech';
import { createRepository } from 'astromech';
import { rateLimitsTable } from './tables/rate-limits';
import { submissionsTable } from './tables/submissions';

/** The columns a submissions list can be ordered by. */
const SUBMISSION_SORTABLE = ['formSlug', 'submittedAt'] as const;

/** Column to direction. `formSlug` orders before `submittedAt`; with neither, newest first. */
export type SubmissionSort = Partial<
    Record<(typeof SUBMISSION_SORTABLE)[number], 'asc' | 'desc' | undefined>
>;

/** What `findMany` and `count` filter by. */
export type SubmissionFilter = {
    formSlug?: string | undefined;
    /** Matched as a substring of `summary` or `formSlug`. */
    search?: string | undefined;
};

/** The submission-row repository over `submissionsTable`. */
export function createSubmissionsRepository(db: PluginContext['db']) {
    const repository = createRepository(submissionsTable, db);

    /** By id; `null` when there is no such submission. */
    async function findOne(id: string): Promise<SubmissionRow | null> {
        return repository.findOne({ id });
    }

    /** The matching submissions in `sort` order; omit `limit` for every match. */
    async function findMany(
        params: SubmissionFilter & {
            sort?: SubmissionSort | undefined;
            limit?: number | undefined;
            offset?: number | undefined;
        } = {}
    ): Promise<SubmissionRow[]> {
        const sorted = SUBMISSION_SORTABLE.flatMap((column) => {
            const direction = params.sort?.[column];
            return direction !== undefined ? [[column, direction] as const] : [];
        });
        return repository.findMany({
            where: filter(params),
            // The id breaks ties, so a page boundary never splits rows unpredictably.
            orderBy: [
                ...(sorted.length > 0 ? sorted : [['submittedAt', 'desc'] as const]),
                ['id', 'desc'],
            ],
            ...(params.limit !== undefined ? { limit: params.limit } : {}),
            ...(params.offset !== undefined ? { offset: params.offset } : {}),
        });
    }

    async function count(params: SubmissionFilter = {}): Promise<number> {
        return repository.count(filter(params));
    }

    async function create(row: NewSubmissionRow): Promise<SubmissionRow> {
        return repository.create(row);
    }

    /** Hard delete. */
    async function del(id: string): Promise<void> {
        await repository.delete(id);
    }

    return { findOne, findMany, count, create, delete: del };
}

/** The list predicate, shared by `findMany` and `count` so the two agree. */
function filter(params: SubmissionFilter): Where<typeof submissionsTable> {
    const { formSlug, search } = params;
    return {
        ...(formSlug !== undefined ? { formSlug } : {}),
        ...(search !== undefined && search !== ''
            ? {
                  or: [
                      { summary: { contains: search } },
                      { formSlug: { contains: search } },
                  ],
              }
            : {}),
    };
}

/**
 * The submission rate limit's counts over `rateLimitsTable`, one row per
 * rate-limit key and form. The `address` column holds the key: an address's
 * key, or the key every HTTP request with no trusted address shares.
 */
export function createRateLimitsRepository(db: PluginContext['db']) {
    const repository = createRepository(rateLimitsTable, db);

    /**
     * Count one request at `now` and return the count in its window, or null
     * when the window already holds `limit` requests, in which case nothing is
     * written. A window that started `windowMs` or more before `now` starts
     * again at one. One statement, so concurrent requests each count once, on
     * D1 too.
     */
    async function consume(
        key: { address: string; formId: string },
        now: number,
        { limit, windowMs }: { limit: number; windowMs: number }
    ): Promise<number | null> {
        const { db: handle, table } = repository.kysely();
        const elapsedBy = now - windowMs;
        const row = await handle
            .insertInto(table)
            .values({ id: crypto.randomUUID(), ...key, windowStart: now, count: 1 })
            .onConflict((conflict) =>
                // Unqualified columns name the stored row, not the new one.
                conflict
                    .columns(['address', 'formId'])
                    .doUpdateSet((eb) => ({
                        count: eb
                            .case()
                            .when('windowStart', '<=', elapsedBy)
                            .then(1)
                            .else(eb('count', '+', 1))
                            .end(),
                        windowStart: eb
                            .case()
                            .when('windowStart', '<=', elapsedBy)
                            .then(now)
                            .else(eb.ref('windowStart'))
                            .end(),
                    }))
                    // A row the WHERE skips is not updated and RETURNING
                    // yields nothing for it.
                    .where((eb) =>
                        eb.or([
                            eb('count', '<', limit),
                            eb('windowStart', '<=', elapsedBy),
                        ])
                    )
            )
            .returning('count')
            .executeTakeFirst();
        return row === undefined ? null : Number(row['count']);
    }

    /** Delete the counts whose window started at or before `elapsedBy`. */
    async function deleteExpired(elapsedBy: number): Promise<void> {
        await repository.deleteMany({ windowStart: { lte: elapsedBy } });
    }

    return { consume, deleteExpired };
}
