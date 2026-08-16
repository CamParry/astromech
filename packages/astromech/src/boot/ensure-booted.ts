/**
 * Lazy runtime boot, shared by every entry point that can be the first thing a
 * host runs: the injected middleware on `fetch`, and the Cloudflare scheduled
 * handler on `scheduled`.
 */

import { initRuntime, startScheduler } from '@/boot/boot';
import { createRegistry } from '@/utilities/registry';

const boot = createRegistry<Promise<void>>('boot', { required: false });

/**
 * The PROMISE is memoised, not its result, so concurrent first requests share
 * one init instead of racing several. A Workers isolate is evicted and replaced,
 * so this runs repeatedly over a deployment's life and has to stay cheap.
 */
export function ensureBooted(): Promise<void> {
    const pending = boot.peek();
    if (pending !== null) return pending;

    const started = (async (): Promise<void> => {
        // Loaded lazily so this module stays importable in plain Node, where
        // `virtual:` does not resolve: a config selecting `cloudflareCron()`
        // reaches here through the scheduler subpath, under jiti.
        const { default: resolvedConfig, rawConfig } =
            await import('virtual:astromech/config');
        await initRuntime(rawConfig, resolvedConfig);
        // Needs the scheduler driver initRuntime registers. On Node that starts
        // one timer; on Workers the driver is a no-op and platform cron drives
        // the scheduled handler instead.
        await startScheduler();
    })();
    boot.set(started);
    return started;
}
