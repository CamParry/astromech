/**
 * CRON runner — executes all registered jobs.
 *
 * Call this from a Cloudflare Workers scheduled event handler or
 * the HTTP trigger endpoint.
 */

import { getDb } from '@/db/registry.js';
import { getCronJobs } from '@/cron/registry.js';
import config from 'virtual:astromech/config';

export async function runScheduledJobs(): Promise<void> {
    const db = getDb();
    const jobs = getCronJobs();

    for (const job of jobs) {
        try {
            await job.handler({ db, config });
        } catch (err) {
            console.error(`[astromech/cron] Job "${job.name}" failed:`, err);
        }
    }
}
