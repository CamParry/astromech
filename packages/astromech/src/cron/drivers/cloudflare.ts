import type { SchedulerDriver } from '@/cron/driver';

/** Cloudflare Cron Triggers are a dumb frequent ticker; cadence is core's.
 *  The Worker `scheduled()` event drives onTick through the exported
 *  scheduled handler (wired separately), so the driver has no `start`.
 *  Selecting it just declares that intent. */
export function cloudflareCron(): SchedulerDriver {
    return { name: 'cloudflare' };
}
