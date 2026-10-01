/**
 * Built-in cron job: publishes each scheduled entry and global whose `publishedAt`
 * has passed through `update`, so the update hooks fire and the row keeps its
 * scheduled date. A row that fails is logged and stays scheduled for the next run.
 */

import type { CronJob } from '@/cron/registry';
import type { AppContext } from '@/types/index';
import { entryMaintenanceRepository } from '@/entries/repository/maintenance';
import { globalRepository } from '@/globals/repository';

export const scheduledPublishJob: CronJob = {
    name: 'scheduled-publish',
    schedule: '* * * * *',
    async handler(ctx) {
        const now = new Date();

        const entries = await entryMaintenanceRepository.findDueScheduled(now);
        for (const { type, id, locale, publishedAt } of entries) {
            await publishOne(ctx, `entry ${type}/${id} (${locale})`, () =>
                ctx.entries.update({
                    type,
                    id,
                    locale,
                    data: { status: 'published', publishedAt },
                })
            );
        }

        const globals = await globalRepository.findDueScheduled(now);
        for (const { key, locale, publishedAt } of globals) {
            await publishOne(ctx, `global ${key} (${locale})`, () =>
                ctx.globals.update({
                    key,
                    locale,
                    data: { status: 'published', publishedAt },
                })
            );
        }
    },
};

/** Runs one row's write, logging a failure rather than throwing it, so the rest still run. */
async function publishOne(
    ctx: AppContext,
    label: string,
    write: () => Promise<unknown>
): Promise<void> {
    try {
        await write();
    } catch (err) {
        ctx.logger.error(`scheduled-publish: ${label} stays scheduled.`, err);
    }
}
