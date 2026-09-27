/**
 * The service methods over stored submissions, behind the Submissions admin
 * resource: list, get and delete, each gated on a plugin permission.
 */
import type { SubmissionRow } from '../tables/submissions';
import type { QueryResult } from 'astromech';
import { defineServiceMethod, queryResultSchema, withFallback, z } from 'astromech';
import { createSubmissionsRepository } from '../repository';

/** The request details `submit` may store with a submission. */
export const submissionMetaSchema = z.object({
    ip: z.string().optional(),
    userAgent: z.string().optional(),
    referer: z.string().optional(),
});

/** A stored submission, as the admin methods answer it. */
const submissionSchema = z.object({
    id: z.string(),
    formId: z.string(),
    formSlug: z.string(),
    /** The coerced field values, keyed by field name. */
    data: z.record(z.string(), z.unknown()),
    /** A readable rendering of `data` for the list column. */
    summary: withFallback(z.string().nullable(), null),
    /** Null unless the plugin stores request details (`storeMeta`). */
    meta: withFallback(submissionMetaSchema.nullable(), null),
    submittedAt: z.date(),
    createdAt: z.date(),
    updatedAt: z.date(),
});

export type Submission = z.output<typeof submissionSchema>;

const deleteSubmissionResultSchema = z.union([
    z.object({ ok: z.literal(true), id: z.string() }),
    z.object({ ok: z.literal(false), reason: z.literal('not-found') }),
]);

export type DeleteSubmissionResult = z.output<typeof deleteSubmissionResultSchema>;

const direction = z.enum(['asc', 'desc']);

export const listSubmissions = defineServiceMethod({
    access: { permission: 'read' },
    summary: 'List stored submissions, newest first, one page at a time.',
    input: z.strictObject({
        search: z.string().optional(),
        // Strict, so a sort on any other column is refused rather than ignored.
        sort: z
            .strictObject({
                formSlug: direction.optional(),
                submittedAt: direction.optional(),
            })
            .optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
        formSlug: z.string().optional(),
    }),
    output: queryResultSchema(submissionSchema),
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
    input: z.strictObject({ id: z.string() }),
    output: submissionSchema.nullable(),
    mutates: false,
    handler: async (input, ctx): Promise<SubmissionRow | null> => {
        return createSubmissionsRepository(ctx.db).findOne(input.id);
    },
});

export const deleteSubmission = defineServiceMethod({
    access: { permission: 'delete' },
    summary: 'Delete a stored submission.',
    input: z.strictObject({ id: z.string() }),
    output: deleteSubmissionResultSchema,
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
