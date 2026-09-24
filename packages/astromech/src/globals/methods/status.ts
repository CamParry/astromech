/**
 * Status transitions. A locale with no content row is a not-found error here:
 * only `update` may create one. A status change writes no version — it changes
 * nothing a version preserves, which is the rule entries apply too.
 */

import type { GlobalRow } from '../repository';
import type { ContentWrite } from '@/content/repository/types';
import type { Global, ResolvedConfig, User } from '@/types/index';
import { defineServiceMethod } from '@/services/define-service-method';
import { gate } from '../internal/access';
import { getCanonicalGlobal, toGlobal } from '../internal/global';
import { localised, scheduleGlobalSchema } from '../schema';

/** Publishes one locale, stamping `publishedAt` when it has none yet. */
export const publishGlobal = defineServiceMethod({
    summary: 'Publish a global.',
    input: localised,
    access: gate('publish'),
    requires: 'statuses',
    mutates: true,
    idempotent: true,
    handler(params, ctx): Promise<Global> {
        return writeStatus(ctx.config, params, ctx.user, (current) => ({
            status: 'published',
            publishedAt: current.publishedAt ?? new Date(),
        }));
    },
});

/** Unpublishes one locale, clearing its publish gate. */
export const unpublishGlobal = defineServiceMethod({
    summary: 'Unpublish a global.',
    input: localised,
    access: gate('publish'),
    requires: 'statuses',
    mutates: true,
    // Data-losing in the sense the effect hints mean: the global stops being
    // served. `ServiceMethodEffect` names unpublish explicitly.
    destructive: true,
    idempotent: true,
    handler(params, ctx): Promise<Global> {
        return writeStatus(ctx.config, params, ctx.user, () => ({
            status: 'unpublished',
            publishedAt: null,
        }));
    },
});

/** Schedules one locale to publish at `publishedAt`. */
export const scheduleGlobal = defineServiceMethod({
    summary: 'Schedule a global to publish at a future time.',
    input: localised.extend(scheduleGlobalSchema.shape),
    access: gate('publish'),
    requires: 'statuses',
    mutates: true,
    idempotent: true,
    handler(params, ctx): Promise<Global> {
        return writeStatus(ctx.config, params, ctx.user, () => ({
            status: 'scheduled',
            publishedAt: params.publishedAt,
        }));
    },
});

/**
 * Apply a status write to an existing canonical row. Every transition needs the
 * `statuses` capability and a row to move.
 */
async function writeStatus(
    config: ResolvedConfig,
    params: { key: string; locale?: string | undefined },
    user: User | null,
    write: (current: GlobalRow) => ContentWrite
): Promise<Global> {
    const { repository, id, locale, current } = await getCanonicalGlobal(config, params);

    const row = await repository.update(
        { id, locale },
        { ...write(current), updatedBy: user?.id ?? null }
    );
    return toGlobal(row);
}
