import type { SchedulerDriver } from '@/types/index';
import { globals } from '@/utilities/registry';

/** In-process ticker driving onTick once a minute. The default scheduler. */
export function interval(): SchedulerDriver {
    return {
        name: 'interval',
        start(onTick) {
            // The handle is a shared global so duplicate tsup entry chunks or
            // repeated start() calls never stack intervals.
            if (globals().cronInterval !== undefined) return;
            const handle = setInterval(() => {
                void onTick(new Date()).catch((err) =>
                    console.error('[astromech/cron] tick failed:', err)
                );
            }, TICK_MS);
            // Don't hold the event loop open solely for the scheduler timer.
            (handle as { unref?: () => void }).unref?.();
            globals().cronInterval = handle;
        },
        stop() {
            const handle = globals().cronInterval;
            if (handle !== undefined) {
                clearInterval(handle);
                globals().cronInterval = undefined;
            }
        },
    };
}

const TICK_MS = 60_000;
