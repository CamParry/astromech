/**
 * The adapter between the batch-only writes in `internal/**` and the entries
 * methods, which take one `id` or a list of `ids`.
 */

import type { AppContext } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { BulkOperationError } from '../errors';

/** The keys a batch-backed method is addressed by: one `id`, or a list of `ids`. */
export const batchAddress = {
    id: z.string().min(1).optional().describe('One entry. Pass this or `ids`.'),
    ids: z
        .array(z.string().min(1))
        .min(1)
        .optional()
        .describe('A list of entries, acted on atomically. Pass this or `id`.'),
};

/**
 * `schema`, refusing a call that names both `id` and `ids`, or neither. Applied
 * last, since a refined object schema cannot be extended.
 */
export function oneOrMany<T extends z.ZodObject>(schema: T): T {
    return schema.superRefine((value: { id?: unknown; ids?: unknown }, ctx) => {
        const hasId = value.id !== undefined;
        const hasIds = value.ids !== undefined;
        if (hasId && hasIds) {
            ctx.addIssue({
                code: 'custom',
                path: ['ids'],
                message: 'Pass `id` or `ids`, not both.',
            });
        } else if (!hasId && !hasIds) {
            ctx.addIssue({
                code: 'custom',
                path: ['id'],
                message: 'Pass `id` or `ids`.',
            });
        }
    });
}

/** What a batch-backed method is called with, once `oneOrMany` has parsed it. */
type Addressed<B> = Omit<B, 'ids'> & {
    id?: string | undefined;
    ids?: readonly string[] | undefined;
};

/**
 * Adapts a batch-only write onto a method taking `id` or `ids`: one id is a
 * batch of one, and its result and errors are unwrapped. Applied once per method
 * at module load, not once per call.
 */
export function fromBatch<B extends { ids: readonly string[] }>(
    write: (params: B, ctx: AppContext) => Promise<void>
): (params: Addressed<B>, ctx: AppContext) => Promise<void>;
export function fromBatch<B extends { ids: readonly string[] }, R>(
    write: (params: B, ctx: AppContext) => Promise<R[]>
): (params: Addressed<B>, ctx: AppContext) => Promise<R | R[]>;
export function fromBatch<B extends { ids: readonly string[] }, R>(
    write: (params: B, ctx: AppContext) => Promise<R[] | void>
) {
    return async (params: Addressed<B>, ctx: AppContext) => {
        const { id, ids, ...rest } = params;
        const many = ids !== undefined;
        const batch = ids ?? (id === undefined ? [] : [id]);
        try {
            const rows = await write({ ...rest, ids: batch } as unknown as B, ctx);
            return many ? rows : rows?.[0];
        } catch (err: unknown) {
            throw many ? err : unwrapBatchOfOne(err);
        }
    };
}

/**
 * For a batch of one the `BulkOperationError` envelope names nothing the caller
 * does not already know, so a call with one `id` gets the underlying error back
 * (a `ValidationError` stays a `ValidationError`).
 */
function unwrapBatchOfOne(err: unknown): unknown {
    return err instanceof BulkOperationError ? (err.cause ?? err) : err;
}
