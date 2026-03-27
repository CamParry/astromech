/**
 * Built-in CRON job: Transition scheduled entries to published.
 *
 * Finds all entries where status = 'scheduled' and publishedAt <= NOW(),
 * then updates them to status = 'published'.
 */

import { and, eq, isNull, lte } from 'drizzle-orm';
import { entriesTable } from '@/db/schema.js';
import type { CronJob } from '@/cron/registry.js';

export const scheduledPublishJob: CronJob = {
    name: 'scheduled-publish',
    async handler({ db }) {
        const now = new Date();

        const due = await db
            .select({ id: entriesTable.id })
            .from(entriesTable)
            .where(
                and(
                    eq(entriesTable.status, 'scheduled'),
                    lte(entriesTable.publishedAt, now),
                    isNull(entriesTable.deletedAt)
                )
            );

        if (due.length === 0) return;

        for (const { id } of due) {
            await db
                .update(entriesTable)
                .set({ status: 'published', updatedAt: new Date() })
                .where(eq(entriesTable.id, id));
        }
    },
};
