/**
 * Publishes one due scheduled entry locale for the `scheduled-publish` job,
 * through the update path, on condition the row is still scheduled for the time
 * the job read.
 */

import type { AppContext } from '@/types/index';
import { fromBatch } from './internal/from-batch';
import { updateEntryBatch } from './internal/update-batch';

/**
 * Publishes the locale, keeping `publishedAt`, so the update hooks fire. Throws
 * `ResourceConflictError` (`not-scheduled`, or `trashed`) when the row changed
 * after the job read it, with nothing written.
 */
export async function publishScheduledEntry(
    ctx: AppContext,
    due: { type: string; id: string; locale: string; publishedAt: Date }
): Promise<void> {
    const { type, id, locale, publishedAt } = due;

    await publishOne(
        {
            type,
            id,
            locale,
            createMissingLocale: false,
            data: { status: 'published', publishedAt },
            scheduledFor: publishedAt,
        },
        ctx
    );
}

const publishOne = fromBatch(updateEntryBatch);
