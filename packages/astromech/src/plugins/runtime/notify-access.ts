/**
 * Notify port (dependency inversion).
 *
 * The plugin runtime is a capability and must not import the `notifications`
 * domain directly — `ctx.notify` is the only reason it ever wanted to. So the
 * runtime declares the slice it needs as a port, typed only from the leaves, and
 * the notifications domain injects the implementation at boot via
 * `registerNotifyAccess` (see `@/notifications/plugin-access`).
 *
 * The implementation lives in a registry slot so it survives the package's
 * multiple bundle entry points. Same shape as `entry-access.ts`.
 */

import type { NotifyInput } from '@/types/index';
import { createRegistry } from '@/utilities/registry';

export type NotifyAccess = {
    /** Deliver one notification to every user the target names. */
    notify(input: NotifyInput): Promise<void>;
};

const access = createRegistry<NotifyAccess>('notifyAccess', {
    hint:
        'The notifications domain must call registerNotifyAccess() (via @/notifications/plugin-access) ' +
        'before the plugin runtime mounts plugins.',
});

/** Inject the notifications-domain implementation. Called once at boot, idempotent. */
export function registerNotifyAccess(implementation: NotifyAccess): void {
    access.set(implementation);
}

/** The injected notify access, or crash-loud if the notifications domain wasn't wired. */
export function notifyAccess(): NotifyAccess {
    return access.get();
}
