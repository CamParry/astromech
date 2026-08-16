/**
 * CRON scheduling.
 *
 * Import once during integration setup. Built-in job registration is handled
 * by the entries domain — see `@/entries/index.js`. The scheduled entrypoints
 * that boot the runtime live in `@/boot/scheduled`.
 */

export { onTick, runDue } from '@/cron/runner';
export { registerCronJob, getCronJobs } from '@/cron/registry';
export type { CronJob, CronContext } from '@/cron/registry';
