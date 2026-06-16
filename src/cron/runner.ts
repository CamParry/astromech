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

import { and, eq, isNull, lte, or } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { Cron } from 'croner';
import { getDb } from '@/db/registry.js';
import { cronTable } from '@/db/schema.js';
import { getCronJobs } from '@/cron/registry.js';
import type { ResolvedConfig } from '@/types/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = LibSQLDatabase<any>;

/** Claim lease: generous so a normal job never self-expires mid-run. A crashed
 *  claim auto-expires after this and the next tick retries. */
const LOCK_TTL_MS = 5 * 60 * 1000;

declare global {
    var __astromechCronTickRunning: boolean | undefined;
    var __astromechCronUnscheduledWarned: Set<string> | undefined;
}

/** Next run strictly after `from`, interpreting `schedule` in `timezone`. */
function nextRunFrom(schedule: string, from: Date, timezone: string): Date | null {
    return new Cron(schedule, { timezone }).nextRun(from) ?? null;
}

async function loadConfig(): Promise<ResolvedConfig> {
    const { default: config } = await import('virtual:astromech/config');
    return config as ResolvedConfig;
}

/**
 * Seed the table from registered jobs. Idempotent: ON CONFLICT DO NOTHING never
 * overwrites a stored (possibly admin-edited) row. Jobs with no seed schedule
 * and no existing row are not scheduled — warn once.
 */
async function seed(db: Db, now: Date, timezone: string): Promise<void> {
    const warned = (globalThis.__astromechCronUnscheduledWarned ??= new Set());
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
        await db
            .insert(cronTable)
            .values({
                name: job.name,
                schedule: job.schedule,
                enabled: true,
                nextRun: nextRunFrom(job.schedule, now, timezone),
            })
            .onConflictDoNothing();
    }
}

/**
 * One due-evaluation pass (NO overlap guard — exported so tests can exercise the
 * DB lock by running passes concurrently). Production code calls onTick().
 */
export async function runDue(now: Date): Promise<void> {
    const db = getDb();
    const config = await loadConfig();
    const timezone = config.timezone ?? 'UTC';

    await seed(db, now, timezone);

    const handlers = new Map(getCronJobs().map((j) => [j.name, j]));

    const due = await db
        .select()
        .from(cronTable)
        .where(
            and(
                eq(cronTable.enabled, true),
                or(lte(cronTable.nextRun, now), isNull(cronTable.nextRun))
            )
        );

    for (const row of due) {
        const job = handlers.get(row.name);
        if (!job) continue; // orphan table row (handler not registered) — skip

        // CAS-claim: succeeds only if unlocked or the prior claim expired.
        const expiry = new Date(now.getTime() + LOCK_TTL_MS);
        const claim = await db
            .update(cronTable)
            .set({ lock: expiry })
            .where(
                and(
                    eq(cronTable.name, row.name),
                    or(isNull(cronTable.lock), lte(cronTable.lock, now))
                )
            );
        if (claim.rowsAffected !== 1) continue; // another tick/instance owns it

        try {
            await job.handler({ db, config });
        } catch (err) {
            console.error(`[astromech/cron] Job "${row.name}" failed:`, err);
        }

        // Record + release, gated on our exact claim token. If our lease expired
        // and was re-claimed, this matches 0 rows and we leave the new owner's
        // state untouched (closes the ABA window). next_run recomputes from
        // `now` (missed runs fire once, no backfill) using the row's CURRENT
        // (possibly admin-edited) schedule.
        await db
            .update(cronTable)
            .set({
                lastRun: now,
                nextRun: nextRunFrom(row.schedule, now, timezone),
                lock: null,
            })
            .where(and(eq(cronTable.name, row.name), eq(cronTable.lock, expiry)));
    }
}

/**
 * Core scheduler tick. Belt-and-suspenders overlap guard (skips if a prior tick
 * in THIS process is still running) layered over the cross-instance DB lock.
 */
export async function onTick(now: Date = new Date()): Promise<void> {
    if (globalThis.__astromechCronTickRunning) return;
    globalThis.__astromechCronTickRunning = true;
    try {
        await runDue(now);
    } finally {
        globalThis.__astromechCronTickRunning = false;
    }
}

/** @deprecated Back-compat shim — now a due-evaluation tick, not run-everything. */
export async function runScheduledJobs(): Promise<void> {
    await onTick(new Date());
}
