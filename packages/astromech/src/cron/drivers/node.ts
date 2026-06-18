import type { SchedulerDriver } from '@/types/index.js';

/** Single in-process ticker. Guarded on globalThis so duplicate tsup entry
 *  chunks or repeated start() calls never stack intervals. */
declare global {
    var __astromechCronInterval: ReturnType<typeof setInterval> | undefined;
}

const TICK_MS = 60_000;

export const nodeDriver: SchedulerDriver = {
    name: 'node',
    start(onTick) {
        if (globalThis.__astromechCronInterval) return;
        const handle = setInterval(() => {
            void onTick(new Date()).catch((err) =>
                console.error('[astromech/cron] tick failed:', err)
            );
        }, TICK_MS);
        // Don't hold the event loop open solely for the scheduler timer.
        (handle as { unref?: () => void }).unref?.();
        globalThis.__astromechCronInterval = handle;
    },
    stop() {
        if (globalThis.__astromechCronInterval) {
            clearInterval(globalThis.__astromechCronInterval);
            globalThis.__astromechCronInterval = undefined;
        }
    },
};
