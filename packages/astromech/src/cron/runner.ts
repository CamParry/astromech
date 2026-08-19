/**
 * CRON due-evaluator.
 *
 * `onTick(now)` is the core scheduler: it seeds the cron table from registered
 * jobs (idempotent), finds jobs due at `now`, CAS-claims each against the
 * shared `_astromech_cron` lock (the multi-instance double-fire guard), runs
 * the handler, then records last_run/next_run and releases the claim — all
 * gated on the exact claim token so a stale instance can never clobber a newer
 * claim. Cadence is read from the TABLE (runtime-editable), not the registry;
 * the registry only supplies handlers + seed schedules.
 */
import type { CronRepository } from '@/cron/repository';
import { Cron } from 'croner';
import { getConfig } from '@/config/registry';
import { getCronJobs } from '@/cron/registry';
import { createCronRepository } from '@/cron/repository';
import { getDb } from '@/database/registry';
import { globals } from '@/registry';

/** Claim lease: generous so a normal job never self-expires mid-run. A crashed
 *  claim auto-expires after this and the next tick retries. */
const LOCK_TTL_MS = 5 * 60 * 1000;

/** Next run strictly after `from`, interpreting `schedule` in `timezone`. */
function nextRunFrom(schedule: string, from: Date, timezone: string): Date | null {
    return new Cron(schedule, { timezone }).nextRun(from) ?? null;
}

/**
 * Seed the table from registered jobs. Idempotent: seeding never overwrites a
 * stored (possibly admin-edited) row. Jobs with no seed schedule and no existing
 * row are not scheduled — warn once.
 */
async function seed(
    repository: CronRepository,
    now: Date,
    timezone: string
): Promise<void> {
    const warned = (globals().cronUnscheduledWarned ??= new Set<string>());
    for (const job of getCronJobs()) {
        if (!job.schedule) {
            if (!warned.has(job.name)) {
                console.warn(
                    `[astromech/cron] Job "${job.name}" has no schedule and no table row — not scheduled.`
                );
                warned.add(job.name);
            }
            continue;
        }
        await repository.seedJob({
            name: job.name,
            schedule: job.schedule,
            enabled: true,
            nextRun: nextRunFrom(job.schedule, now, timezone),
        });
    }
}

/**
 * One due-evaluation pass (NO overlap guard — exported so tests can exercise the
 * DB lock by running passes concurrently). Production code calls onTick().
 */
export async function runDue(now: Date): Promise<void> {
    // Cron handlers are handed the raw Kysely handle — that is their public
    // contract, so the runner still resolves one even though its own queries go
    // through the storage.
    const db = getDb();
    const config = getConfig();
    const timezone = config.timezone ?? 'UTC';
    const repository = createCronRepository();

    await seed(repository, now, timezone);

    const handlers = new Map(getCronJobs().map((j) => [j.name, j]));

    for (const row of await repository.due(now)) {
        const job = handlers.get(row.name);
        if (!job) continue; // orphan table row (handler not registered) — skip

        // CAS-claim: succeeds only if unlocked or the prior claim expired.
        const expiry = new Date(now.getTime() + LOCK_TTL_MS);
        if (!(await repository.claim(row.name, now, expiry))) continue; // another tick owns it

        try {
            await job.handler({ db, config });
        } catch (err) {
            console.error(`[astromech/cron] Job "${row.name}" failed:`, err);
        }

        // Record + release, gated on our exact claim token (see `claim`'s ABA
        // note). next_run recomputes from `now` — missed runs fire once, no
        // backfill — using the row's CURRENT (possibly admin-edited) schedule.
        await repository.recordRunAndRelease(row.name, expiry, {
            lastRun: now,
            nextRun: nextRunFrom(row.schedule, now, timezone),
        });
    }
}

/**
 * Core scheduler tick. Belt-and-suspenders overlap guard (skips if a prior tick
 * in THIS process is still running) layered over the cross-instance DB lock.
 */
export async function onTick(now: Date = new Date()): Promise<void> {
    if (globals().cronTickRunning === true) return;
    globals().cronTickRunning = true;
    try {
        await runDue(now);
    } finally {
        globals().cronTickRunning = false;
    }
}
