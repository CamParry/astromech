import type { SchedulerDriver } from '@/cron/driver';

/** No in-process ticker: an external poke (POST /cron/run) drives onTick
 *  directly via the route, so the driver has no `start`. Selecting it just
 *  declares that intent. */
export function webhook(): SchedulerDriver {
    return { name: 'webhook' };
}
