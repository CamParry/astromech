/**
 * Built-in CRON job: Purge old trashed entries.
 *
 * Hard-deletes entries that have been in the trash longer than
 * config.trash.retentionDays, with their versions and relationship rows.
 */

import type { CronJob } from '@/cron/registry';
import { entryMaintenanceRepository } from '../repository/maintenance';

export const trashPurgeJob: CronJob = {
    name: 'trash-purge',
    schedule: '0 3 * * *',
    async handler({ config }) {
        if (!config.trash.enabled || config.trash.retentionDays <= 0) return;

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - config.trash.retentionDays);

        await entryMaintenanceRepository.purgeTrashedBefore(cutoff);
    },
};
