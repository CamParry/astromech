import type { Hook, HookEvent, HookHandlerFor } from '@/types/index';

/**
 * Define a single plugin hook; payload type is inferred from the event key.
 * Collected into the plugin's `hooks` array.
 */
export function defineHook<E extends HookEvent>(
    event: E,
    handler: HookHandlerFor<E>
): Hook {
    return { event, handler: handler as Hook['handler'] };
}
