import type { SchedulerDriver } from '@/types/index.js';

/** No in-process ticker: an external poke (POST /cron/run) drives onTick
 *  directly via the route. Selecting this driver just declares that intent. */
export function webhook(): SchedulerDriver {
    return {
        name: 'webhook',
        start() {
            /* no-op — the HTTP poke route calls the core due-evaluator */
        },
    };
}
