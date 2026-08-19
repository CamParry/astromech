import { scheduledPublishJob } from './scheduled-publish';
import { trashPurgeJob } from './trash-purge';

export { scheduledPublishJob, trashPurgeJob };

/** The cron jobs the entries domain ships built-in. */
export const entryJobs = [scheduledPublishJob, trashPurgeJob];
