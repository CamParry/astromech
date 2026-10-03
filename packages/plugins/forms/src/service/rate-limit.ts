/**
 * Fixed-window rate limit for `submit`, counted in the plugin's own table per
 * connecting address and form, so every process and Workers isolate on the
 * database shares one count.
 */

import type { PluginContext } from 'astromech';
import { createRateLimitsRepository } from '../repository';

export type RateLimitOptions = { limit: number; windowMs: number };

/**
 * Record one submission from `address` to the form `formId` and answer whether
 * it is within the limit. The window starts at the first submission and resets
 * whole once it has elapsed; starting one also deletes every elapsed count.
 */
export async function consumeRateLimit(
    db: PluginContext['db'],
    key: { address: string; formId: string },
    options: RateLimitOptions
): Promise<boolean> {
    const rateLimits = createRateLimitsRepository(db);
    const now = Date.now();

    const count = await rateLimits.consume(key, now, options.windowMs);
    if (count === 1) await rateLimits.deleteExpired(now - options.windowMs);

    return count <= options.limit;
}
