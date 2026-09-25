/**
 * The service methods over stored submissions, behind the Submissions admin
 * resource: list, get and delete, each gated on a plugin permission.
 */
import type { SubmissionRow } from '../tables/submissions';
import type { QueryResult } from 'astromech';
import { defineServiceMethod, z } from 'astromech';
import { createSubmissionsRepository } from '../repository';

export type DeleteSubmissionResult =
    | { ok: true; id: string }
    | { ok: false; reason: 'not-found' };

const direction = z.enum(['asc', 'desc']);

export const listSubmissions = defineServiceMethod({
    access: { permission: 'read' },
    summary: 'List stored submissions, newest first, one page at a time.',
    input: z.object({
        search: z.string().optional(),
        // Strict, so a sort on any other column is refused rather than ignored.
        sort: z
            .object({ formSlug: direction.optional(), submittedAt: direction.optional() })
            .strict()
            .optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
        formSlug: z.string().optional(),
    }),
    mutates: false,
    handler: async (input, ctx): Promise<QueryResult<SubmissionRow>> => {
        const { page, limit, sort, search, formSlug } = input;
        const submissions = createSubmissionsRepository(ctx.db);
        const [data, total] = await Promise.all([
            submissions.findMany({
                search,
                formSlug,
                sort,
                limit,
                offset: (page - 1) * limit,
            }),
            submissions.count({ search, formSlug }),
        ]);
        return {
            data,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        };
    },
});

export const getSubmission = defineServiceMethod({
    access: { permission: 'read' },
    summary: 'Fetch one stored submission by id.',
    input: z.object({ id: z.string() }),
    mutates: false,
    handler: async (input, ctx): Promise<SubmissionRow | null> => {
        return createSubmissionsRepository(ctx.db).findOne(input.id);
    },
});

export const deleteSubmission = defineServiceMethod({
    access: { permission: 'delete' },
    summary: 'Delete a stored submission.',
    input: z.object({ id: z.string() }),
    mutates: true,
    destructive: true,
    handler: async (input, ctx): Promise<DeleteSubmissionResult> => {
        const submissions = createSubmissionsRepository(ctx.db);
        if ((await submissions.findOne(input.id)) === null) {
            return { ok: false, reason: 'not-found' };
        }
        await submissions.delete(input.id);
        return { ok: true, id: input.id };
    },
});
