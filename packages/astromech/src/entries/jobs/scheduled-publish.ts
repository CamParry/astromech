/**
 * Built-in CRON job: Transition scheduled entries to published.
 *
 * Finds all entries where status = 'scheduled' and publishedAt <= NOW(),
 * then updates them to status = 'published'.
 */

import type { CronJob } from '@/cron/registry';
import { entryMaintenanceRepository } from '../repository/maintenance';

export const scheduledPublishJob: CronJob = {
    name: 'scheduled-publish',
    schedule: '* * * * *',
    async handler() {
        await entryMaintenanceRepository.publishDueScheduled(new Date());
    },
};
