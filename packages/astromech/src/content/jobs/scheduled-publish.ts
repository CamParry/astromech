/**
 * Built-in cron job: publishes each scheduled entry and global whose `publishedAt`
 * has passed through the update path, so the update hooks fire and the row keeps
 * its scheduled date. A row changed since the job read it is skipped; a row that
 * fails is logged and stays scheduled for the next run.
 */

import type { CronJob } from '@/cron/registry';
import type { AppContext } from '@/types/index';
import { entryMaintenanceRepository } from '@/entries/repository/maintenance';
import { publishScheduledEntry } from '@/entries/scheduled-publish';
import { ResourceConflictError } from '@/errors/resource';
import { globalRepository } from '@/globals/repository';
import { publishScheduledGlobal } from '@/globals/scheduled-publish';

export const scheduledPublishJob: CronJob = {
    name: 'scheduled-publish',
    schedule: '* * * * *',
    async handler(ctx) {
        const now = new Date();

        const entries = await entryMaintenanceRepository.findDueScheduled(now);
        for (const due of entries) {
            await publishOne(ctx, `entry ${due.type}/${due.id} (${due.locale})`, () =>
                publishScheduledEntry(ctx, due)
            );
        }

        const globals = await globalRepository.findDueScheduled(now);
        for (const due of globals) {
            await publishOne(ctx, `global ${due.key} (${due.locale})`, () =>
                publishScheduledGlobal(ctx, due)
            );
        }
    },
};

/** Runs one row's write, logging a failure rather than throwing it, so the rest still run. */
async function publishOne(
    ctx: AppContext,
    label: string,
    write: () => Promise<void>
): Promise<void> {
    try {
        await write();
    } catch (err) {
        // Unscheduled, rescheduled or trashed since the job read it: the later
        // change wins, so the skip is not a failure.
        if (err instanceof ResourceConflictError) {
            ctx.logger.debug(`scheduled-publish: ${label} skipped. ${err.message}`);
            return;
        }
        ctx.logger.error(`scheduled-publish: ${label} stays scheduled.`, err);
    }
}
