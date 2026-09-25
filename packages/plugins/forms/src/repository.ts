/**
 * The submissions repository: the one place `submissionsTable` meets the
 * database. Built per call from `ctx.db`, so a transaction scope reaches it.
 */
import type { NewSubmissionRow, SubmissionRow } from './tables/submissions';
import type { PluginContext, Where } from 'astromech';
import { createRepository } from 'astromech';
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
