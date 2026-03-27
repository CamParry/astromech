/**
 * Built-in CRON jobs registration.
 *
 * Import this once during integration setup to register built-in jobs.
 */

import { registerCronJob } from '@/cron/registry.js';
import { scheduledPublishJob } from '@/cron/jobs/scheduled-publish.js';
import { trashPurgeJob } from '@/cron/jobs/trash-purge.js';

export function registerBuiltInCronJobs(): void {
    registerCronJob(scheduledPublishJob);
    registerCronJob(trashPurgeJob);
}

export { runScheduledJobs } from '@/cron/runner.js';
export { registerCronJob, getCronJobs } from '@/cron/registry.js';
export type { CronJob, CronContext } from '@/cron/registry.js';
