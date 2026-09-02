/**
 * Status transitions. A locale with no content row is a not-found error here:
 * only `update` may create one. A status change writes no version — it changes
 * nothing a version preserves, which is the rule entries apply too.
 */

import type { GlobalRow } from '../repository/globals-table';
import type { ContentWrite } from '@/content/repository/types';
import type { Global } from '@/types/index';
import { parseInput } from '@/errors/validation';
import { getCurrentUser } from '@/request-context/request-context';
import { asGlobal, requireCanonical } from '../internal/global';
import { scheduleGlobalSchema } from '../schema';

/** Publishes one locale, stamping `publishedAt` when it has none yet. */
export async function publishGlobal(params: {
    key: string;
    locale?: string;
}): Promise<Global> {
    return writeStatus(params, (current) => ({
        status: 'published',
        publishedAt: current.publishedAt ?? new Date(),
    }));
}

/** Unpublishes one locale, clearing its publish gate. */
export async function unpublishGlobal(params: {
    key: string;
    locale?: string;
}): Promise<Global> {
    return writeStatus(params, () => ({ status: 'unpublished', publishedAt: null }));
}

/** Schedules one locale to publish at `publishedAt`. */
export async function scheduleGlobal(params: {
    key: string;
    locale?: string;
    publishedAt: Date;
}): Promise<Global> {
    const validated = parseInput(scheduleGlobalSchema, {
        publishedAt: params.publishedAt,
    });
    return writeStatus(params, () => ({
        status: 'scheduled',
        publishedAt: validated.publishedAt,
    }));
}

/**
 * Apply a status write to an existing canonical row. Every transition needs the
 * `statuses` capability and a row to move.
 */
async function writeStatus(
    params: { key: string; locale?: string },
    write: (current: GlobalRow) => ContentWrite
): Promise<Global> {
    const { repository, id, locale, current } = await requireCanonical({
        ...params,
        capability: 'statuses',
    });

    const user = await getCurrentUser();
    const row = await repository.update(
        { id, locale },
        { ...write(current), updatedBy: user?.id ?? null }
    );
    return asGlobal(row);
}
