import { registerCronJob } from '@/cron/registry.js';
import { scheduledPublishJob } from './scheduled-publish.js';
import { trashPurgeJob } from './trash-purge.js';

export { scheduledPublishJob, trashPurgeJob };

export function registerBuiltInEntryJobs(): void {
    registerCronJob(scheduledPublishJob);
    registerCronJob(trashPurgeJob);
}
