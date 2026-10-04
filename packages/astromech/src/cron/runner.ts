/**
 * CRON due-evaluator. `onTick(now)` syncs the cron table from registered
 * jobs, finds jobs due, CAS-claims each against the shared lock, runs the
 * handler, then records the run, its result and any error, and releases the claim.
 */
import type { AppContext } from '@/types/index';
import { Cron } from 'croner';
import { getCronJobs } from '@/cron/registry';
import { cronRepository } from '@/cron/repository';
import { globals } from '@/registry';

/** Claim lease: generous so a normal job never self-expires mid-run. A crashed
 *  claim auto-expires after this and the next tick retries. */
const LOCK_TTL_MS = 5 * 60 * 1000;

/** Next run strictly after `from`, interpreting `schedule` in `timezone`. */
function nextRunFrom(schedule: string, from: Date, timezone: string): Date | null {
    return new Cron(schedule, { timezone }).nextRun(from) ?? null;
}

/**
 * Sync the table from registered jobs: config is the source of truth for a
 * schedule. A job with no schedule is not scheduled (warned once); the row of
 * a job no longer registered is left alone, and the runner skips it.
 */
async function syncJobs(now: Date, timezone: string): Promise<void> {
    const warned = (globals().cronUnscheduledWarned ??= new Set<string>());
    for (const job of getCronJobs()) {
        if (!job.schedule) {
            if (!warned.has(job.name)) {
                console.warn(
                    `[astromech/cron] Job "${job.name}" has no schedule — not scheduled.`
                );
                warned.add(job.name);
            }
            continue;
        }
        await cronRepository.syncJob({
            name: job.name,
            schedule: job.schedule,
            nextRun: nextRunFrom(job.schedule, now, timezone),
        });
    }
}

/**
 * One due-evaluation pass (NO overlap guard — exported so tests can exercise the
 * DB lock by running passes concurrently). Production code calls onTick().
 * Every job runs with `ctx`, the system context, whoever triggered the tick.
 */
export async function runDue(now: Date, ctx: AppContext): Promise<void> {
    const config = ctx.config;
    const timezone = config.timezone ?? 'UTC';

    await syncJobs(now, timezone);

    const handlers = new Map(getCronJobs().map((j) => [j.name, j]));

    for (const row of await cronRepository.due(now)) {
        const job = handlers.get(row.name);
        if (!job) continue; // orphan table row (handler not registered) — skip

        // CAS-claim: succeeds only if unlocked or the prior claim expired.
        const expiry = new Date(now.getTime() + LOCK_TTL_MS);
        if (!(await cronRepository.claim(row.name, now, expiry))) continue; // another tick owns it

        let lastError: string | null = null;
        try {
            await job.handler(ctx);
        } catch (err) {
            console.error(`[astromech/cron] Job "${row.name}" failed:`, err);
            lastError = err instanceof Error ? err.message : String(err);
        }

        // Record + release, gated on our exact claim token (see `claim`'s ABA
        // note). next_run recomputes from `now` — missed runs fire once, no
        // backfill — using the row's schedule as synced from config.
        await cronRepository.recordRunAndRelease(row.name, expiry, {
            lastRun: now,
            lastResult: lastError === null ? 'ok' : 'error',
            lastError,
            nextRun: nextRunFrom(row.schedule, now, timezone),
        });
    }
}

/**
 * Core scheduler tick. Belt-and-suspenders overlap guard (skips if a prior tick
 * in THIS process is still running) layered over the cross-instance DB lock.
 */
export async function onTick(now: Date, ctx: AppContext): Promise<void> {
    if (globals().cronTickRunning === true) return;
    globals().cronTickRunning = true;
    try {
        await runDue(now, ctx);
    } finally {
        globals().cronTickRunning = false;
    }
}
