/**
 * Fixed-window rate limit for `submit`, held in process.
 *
 * Multi-instance (e.g. several Workers) is NOT guarded — each instance counts
 * its own traffic, the same single-instance self-hosted assumption the backups
 * overlap guard makes.
 */

export type RateLimitOptions = { limit: number; windowMs: number };

type Window = { startedAt: number; count: number };

// A globalThis registry rather than a module-level Map: tsup emits several entry
// chunks and a module-level singleton duplicates across them.
declare global {
    var __astromechFormsRateLimit: Map<string, Window> | undefined;
}

/** Entries older than one window are dropped once the map passes this size. */
const PRUNE_ABOVE = 1000;

/**
 * Record one hit for `key` and answer whether it is within the limit. The
 * window starts at the first hit and resets whole once it has elapsed.
 */
export function consumeRateLimit(key: string, options: RateLimitOptions): boolean {
    const windows = (globalThis.__astromechFormsRateLimit ??= new Map());
    const now = Date.now();

    if (windows.size > PRUNE_ABOVE) prune(windows, now, options.windowMs);

    const current = windows.get(key);
    if (current === undefined || now - current.startedAt >= options.windowMs) {
        windows.set(key, { startedAt: now, count: 1 });
        return options.limit >= 1;
    }

    current.count += 1;
    return current.count <= options.limit;
}

/** Drop the counters whose window has elapsed. */
function prune(windows: Map<string, Window>, now: number, windowMs: number): void {
    for (const [key, window] of windows) {
        if (now - window.startedAt >= windowMs) windows.delete(key);
    }
}

/** Clear every counter. For tests — nothing in the plugin calls it. */
export function resetRateLimit(): void {
    globalThis.__astromechFormsRateLimit = undefined;
}
