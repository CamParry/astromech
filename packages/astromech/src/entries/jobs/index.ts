import { registerCronJob } from '@/cron/registry';
import { scheduledPublishJob } from './scheduled-publish';
import { trashPurgeJob } from './trash-purge';

export { scheduledPublishJob, trashPurgeJob };

export function registerBuiltInEntryJobs(): void {
    registerCronJob(scheduledPublishJob);
    registerCronJob(trashPurgeJob);
}
