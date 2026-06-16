import type { SchedulerDriver } from '@/types/index.js';

/** Cloudflare Cron Triggers are a dumb frequent ticker; cadence is core's.
 *  The Worker entry calls the exported scheduled handler (wired separately),
 *  which invokes onTick. Selecting this driver just declares that intent. */
export const cloudflareDriver: SchedulerDriver = {
    name: 'cloudflare',
    start() {
        /* no-op — the Worker scheduled() event drives onTick */
    },
};
