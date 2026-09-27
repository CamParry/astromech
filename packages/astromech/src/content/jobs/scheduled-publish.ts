/**
 * Built-in cron job: moves every scheduled entry and global whose `publishedAt`
 * has passed to `published`. A bulk write per resource, so no update hook fires.
 */

import type { CronJob } from '@/cron/registry';
import { entryMaintenanceRepository } from '@/entries/repository/maintenance';
import { globalRepository } from '@/globals/repository';

export const scheduledPublishJob: CronJob = {
    name: 'scheduled-publish',
    schedule: '* * * * *',
    async handler() {
        const now = new Date();
        await entryMaintenanceRepository.publishDueScheduled(now);
        await globalRepository.publishDueScheduled(now);
    },
};
