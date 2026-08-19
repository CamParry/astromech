/**
 * Built-in CRON job: Transition scheduled entries to published.
 *
 * Finds all entries where status = 'scheduled' and publishedAt <= NOW(),
 * then updates them to status = 'published'.
 */

import type { CronJob } from '@/cron/registry';
import { createEntryMaintenanceRepository } from '../repository/maintenance';

export const scheduledPublishJob: CronJob = {
    name: 'scheduled-publish',
    schedule: '* * * * *',
    async handler({ db }) {
        await createEntryMaintenanceRepository(db).publishDueScheduled(new Date());
    },
};
