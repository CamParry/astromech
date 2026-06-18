/**
 * Built-in CRON job: Purge old trashed entries.
 *
 * Hard-deletes entries that have been in the trash longer than
 * config.trash.retentionDays. Cascade deletes handle relationships/versions.
 */

import { and, isNotNull, lte } from 'drizzle-orm';
import { entriesTable } from '../schema.js';
import type { CronJob } from '@/cron/registry.js';

export const trashPurgeJob: CronJob = {
    name: 'trash-purge',
    schedule: '0 3 * * *',
    async handler({ db, config }) {
        if (!config.trash.enabled || config.trash.retentionDays <= 0) return;

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - config.trash.retentionDays);

        await db
            .delete(entriesTable)
            .where(
                and(
                    isNotNull(entriesTable.deletedAt),
                    lte(entriesTable.deletedAt, cutoff)
                )
            );
    },
};
