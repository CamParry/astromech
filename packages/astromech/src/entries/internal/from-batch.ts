/**
 * The adapter between the batch-only writes in `internal/**` and the
 * `id: string | readonly string[]` overloads the entries methods expose.
 */

import type { AppContext } from '@/types/index';
import { BulkOperationError } from '../errors';

/**
 * Adapts a batch-only write onto the `id: string | readonly string[]` overload:
 * one id is a batch of one, and its result and errors are unwrapped. Applied
 * once per method at module load, not once per call.
 */
export function fromBatch<B extends { ids: readonly string[] }>(
    write: (params: B, ctx: AppContext) => Promise<void>
): (
    params: Omit<B, 'ids'> & { id: string | readonly string[] },
    ctx: AppContext
) => Promise<void>;
export function fromBatch<B extends { ids: readonly string[] }, R>(
    write: (params: B, ctx: AppContext) => Promise<R[]>
): (
    params: Omit<B, 'ids'> & { id: string | readonly string[] },
    ctx: AppContext
) => Promise<R | R[]>;
export function fromBatch<B extends { ids: readonly string[] }, R>(
    write: (params: B, ctx: AppContext) => Promise<R[] | void>
) {
    return async (
        params: Omit<B, 'ids'> & { id: string | readonly string[] },
        ctx: AppContext
    ) => {
        const { id, ...rest } = params;
        const many = Array.isArray(id);
        try {
            const rows = await write({ ...rest, ids: [id].flat() } as unknown as B, ctx);
            return many ? rows : rows?.[0];
        } catch (err: unknown) {
            throw many ? err : unwrapBatchOfOne(err);
        }
    };
}

/**
 * For a batch of one the `BulkOperationError` envelope names nothing the caller
 * does not already know, so the single-id overloads hand back the underlying
 * error (a `ValidationError` stays a `ValidationError`).
 */
function unwrapBatchOfOne(err: unknown): unknown {
    return err instanceof BulkOperationError ? (err.cause ?? err) : err;
}
