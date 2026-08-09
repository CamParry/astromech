/**
 * Injects the notifications-domain implementation into the plugin runtime's
 * notify port (dependency inversion — see `@/plugins/runtime/notify-access`).
 *
 * Exposed as an explicit `wireNotifyAccess()` CALL rather than an import
 * side-effect: the package is `sideEffects: false`, so a bare
 * `import './plugin-access'` would be tree-shaken out of the build and the port
 * would never register. The composition root calls this once before
 * `registerPlugins`, next to `wireEntryAccess()`.
 *
 * `notify()` reaches only storage, so this module pulls in no
 * `virtual:astromech/config` and stays safe in the Astro integration's
 * plain-Node import graph.
 */

import { registerNotifyAccess } from '@/plugins/runtime/notify-access';
import { notify } from './service';

/** Wire the notifications implementation into the plugin runtime. Idempotent. */
export function wireNotifyAccess(): void {
    registerNotifyAccess({ notify });
}
