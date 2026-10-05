/**
 * Built-in CRON job: forget sign-in failures nobody has added to for a day and
 * whose lock, if any, has ended, and blocks that have expired.
 */

import type { CronJob } from '@/cron/registry';
import { blockedAddressRepository } from '@/security/repository/blocked-addresses';
import { signInFailureRepository } from '@/security/repository/sign-in-failures';

/** How long a counter sits idle before the cleanup job deletes it. */
const IDLE_MS = 24 * 60 * 60_000;

export const securityCleanupJob: CronJob = {
    name: 'security-cleanup',
    schedule: '0 * * * *',
    async handler() {
        const now = Date.now();
        await signInFailureRepository.deleteStale(now - IDLE_MS, now);
        await blockedAddressRepository.deleteExpired(new Date(now));
    },
};

/** Every CRON job the security module registers. */
export const securityJobs = [securityCleanupJob];
