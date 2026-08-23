import { scheduledPublishJob } from './scheduled-publish';
import { trashPurgeJob } from './trash-purge';

/** The cron jobs the entries module ships built-in. */
export const entryJobs = [scheduledPublishJob, trashPurgeJob];
