/**
 * Built-in CRON job: Transition scheduled entries to published.
 *
 * Finds all entries where status = 'scheduled' and publishedAt <= NOW(),
 * then updates them to status = 'published'.
 */

import { createEntryMaintenanceStorage } from '../storage/maintenance.js';
import type { CronJob } from '@/cron/registry.js';

export const scheduledPublishJob: CronJob = {
    name: 'scheduled-publish',
    schedule: '* * * * *',
    async handler({ db }) {
        await createEntryMaintenanceStorage(db).publishDueScheduled(new Date());
    },
};
