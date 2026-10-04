/**
 * Publishes one due scheduled global locale for the `scheduled-publish` job,
 * through the update path, on condition the row is still scheduled for the time
 * the job read.
 */

import type { AppContext } from '@/types/index';
import { updateGlobalLocale } from './internal/update-global';

/**
 * Publishes the locale, keeping `publishedAt`, so the update hooks fire. Throws
 * `ResourceConflictError` (`not-scheduled`) when the row changed after the job
 * read it, or `ResourceNotFoundError` when it is gone; nothing is written.
 */
export async function publishScheduledGlobal(
    ctx: AppContext,
    due: { key: string; locale: string; publishedAt: Date }
): Promise<void> {
    const { key, locale, publishedAt } = due;

    await updateGlobalLocale(
        {
            key,
            locale,
            createMissingLocale: false,
            method: 'scheduled-publish',
            data: { status: 'published', publishedAt },
            scheduledFor: publishedAt,
        },
        ctx
    );
}
