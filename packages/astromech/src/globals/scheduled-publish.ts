/**
 * Publishes one due scheduled global locale for the `scheduled-publish` job,
 * through the update path, on condition the row is still scheduled for the time
 * the job read.
 */

import type { AppContext, MethodContext } from '@/types/index';
import { updateGlobalLocale } from './internal/update-global';

/**
 * Publishes the locale, keeping `publishedAt`, so the update hooks fire. Throws
 * `ResourceConflictError` (`not-scheduled`) when the row changed after the job
 * read it, with nothing written.
 */
export async function publishScheduledGlobal(
    ctx: AppContext,
    due: { key: string; locale: string; publishedAt: Date }
): Promise<void> {
    const { key, locale, publishedAt } = due;
    // As `bind()` builds it, so the context's getters stay unevaluated.
    const withMethod = Object.create(ctx, {
        method: { value: { name: 'globals.publish' }, enumerable: true },
    }) as AppContext & MethodContext;

    await updateGlobalLocale(
        {
            key,
            locale,
            createMissingLocale: false,
            data: { status: 'published', publishedAt },
            scheduledFor: publishedAt,
        },
        withMethod
    );
}
