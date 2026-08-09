/**
 * Built-in CRON job: Purge old trashed entries.
 *
 * Hard-deletes entries that have been in the trash longer than
 * config.trash.retentionDays. Versions cascade via their FK; relationship index
 * rows have none, so the purged ids are cleared from the index by hand.
 */

import { createRelationshipStorage } from '@/database/storage/relationships';
import { createEntryMaintenanceStorage } from '../storage/maintenance';
import type { CronJob } from '@/cron/registry';

export const trashPurgeJob: CronJob = {
    name: 'trash-purge',
    schedule: '0 3 * * *',
    async handler({ db, config }) {
        if (!config.trash.enabled || config.trash.retentionDays <= 0) return;

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - config.trash.retentionDays);

        const purged = await createEntryMaintenanceStorage(db).purgeTrashedBefore(cutoff);
        // Both directions: the edges a purged entry owned, and the edges other
        // entries still record as pointing at it.
        const relationships = createRelationshipStorage(db);
        for (const id of purged) {
            await relationships.deleteByResource(id, 'entry');
        }
    },
};
