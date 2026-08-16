/**
 * Fixed-window rate limit for `submit`, held in process.
 *
 * Counters are capped: at `MAX_KEYS` the window that started longest ago is
 * dropped to make room, so the map cannot grow without bound.
 *
 * Multi-instance (e.g. several Workers) is NOT guarded — each instance counts
 * its own traffic, the same single-instance self-hosted assumption the backups
 * overlap guard makes.
 */

export type RateLimitOptions = { limit: number; windowMs: number };

type Window = { startedAt: number; count: number };

type RateLimitState = { windows: Map<string, Window>; prunedAt: number };

// A globalThis registry rather than a module-level Map: tsup emits several entry
// chunks and a module-level singleton duplicates across them.
declare global {
    var __astromechFormsRateLimit: RateLimitState | undefined;
}

/** Elapsed windows are swept once the map passes this size. */
const PRUNE_ABOVE = 1000;

/** Hard cap on live counters — the sweep alone cannot bound a map of live keys. */
const MAX_KEYS = 10_000;

/**
 * Record one hit for `key` and answer whether it is within the limit. The
 * window starts at the first hit and resets whole once it has elapsed.
 */
export function consumeRateLimit(key: string, options: RateLimitOptions): boolean {
    const state = (globalThis.__astromechFormsRateLimit ??= {
        windows: new Map(),
        prunedAt: 0,
    });
    const { windows } = state;
    const now = Date.now();

    // At most one sweep per window: it walks every counter, and a busy site
    // would otherwise pay that walk on every request.
    if (windows.size > PRUNE_ABOVE && now - state.prunedAt >= options.windowMs) {
        prune(windows, now, options.windowMs);
        state.prunedAt = now;
    }
    if (windows.size >= MAX_KEYS && !windows.has(key)) evictOldest(windows);

    const current = windows.get(key);
    if (current === undefined || now - current.startedAt >= options.windowMs) {
        // Re-inserted rather than overwritten so insertion order stays window
        // start order, which is what `evictOldest` reads.
        windows.delete(key);
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

/** Drop the counter whose window started longest ago. */
function evictOldest(windows: Map<string, Window>): void {
    const oldest = windows.keys().next();
    if (oldest.done !== true) windows.delete(oldest.value);
}

/** Clear every counter. For tests — nothing in the plugin calls it. */
export function resetRateLimit(): void {
    globalThis.__astromechFormsRateLimit = undefined;
}
