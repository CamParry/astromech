import { trashPurgeJob } from './trash-purge';

/** The cron jobs the entries module ships built-in. */
export const entryJobs = [trashPurgeJob];
