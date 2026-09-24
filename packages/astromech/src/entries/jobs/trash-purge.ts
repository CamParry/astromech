/**
 * Built-in CRON job: Purge old trashed entries.
 *
 * Hard-deletes entries that have been in the trash longer than
 * config.trash.retentionDays. Versions cascade via their FK; relationship index
 * rows have none, so the purged ids are cleared from the index by hand.
 */

import type { CronJob } from '@/cron/registry';
import { getRelationshipRepository } from '@/content/repository/relationships';
import { getEntryMaintenanceRepository } from '../repository/maintenance';

export const trashPurgeJob: CronJob = {
    name: 'trash-purge',
    schedule: '0 3 * * *',
    async handler({ config }) {
        if (!config.trash.enabled || config.trash.retentionDays <= 0) return;

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - config.trash.retentionDays);

        const purged = await getEntryMaintenanceRepository().purgeTrashedBefore(cutoff);
        // Both directions: the references a purged entry held, and the ones other
        // entries still record as pointing at it.
        const relationships = getRelationshipRepository();
        for (const id of purged) {
            await relationships.deleteByResource(id, 'entry');
        }
    },
};
