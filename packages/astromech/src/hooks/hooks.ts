/**
 * The hook runner: `addHook` registers a handler, `runHook` awaits an event's
 * handlers in registration order (a non-`undefined` return replaces the
 * payload for the next one and for the caller), `hasHook` reports whether
 * anything is subscribed. No try/catch — a handler throw propagates.
 */

import type { HookEvent, HookPayloadFor } from '@/types/hooks';
import { createKeyedRegistry } from '@/registry';

/** A hook handler: reads the payload, may return a replacement, may throw. */
// `void` in the union (not `undefined`) is what lets a handler omit `return`.
/* eslint-disable @typescript-eslint/no-invalid-void-type */
export type HookCallback<Payload> = (
    payload: Payload
) => Promise<void | Payload> | void | Payload;
/* eslint-enable @typescript-eslint/no-invalid-void-type */

const handlers = createKeyedRegistry<HookCallback<unknown>[]>('hooks');

/** Register `handler` for `event`, appended after any already registered. */
export function addHook<E extends HookEvent>(
    event: E,
    handler: HookCallback<HookPayloadFor<E>>
): void {
    const list = handlers.get(event) ?? [];
    list.push(handler as HookCallback<unknown>);
    handlers.set(event, list);
}

/**
 * Run `event`'s handlers in registration order. A handler's non-`undefined`
 * return replaces the payload for the next handler and is what this resolves
 * to; a handler throw propagates from here to the caller.
 */
export async function runHook<E extends HookEvent>(
    event: E,
    payload: HookPayloadFor<E>
): Promise<HookPayloadFor<E>> {
    let current: unknown = payload;
    for (const handler of handlers.get(event) ?? []) {
        const result = await handler(current);
        if (result !== undefined) current = result;
    }
    return current as HookPayloadFor<E>;
}

/** Whether any handler is registered for `event`. */
export function hasHook(event: HookEvent): boolean {
    return (handlers.get(event)?.length ?? 0) > 0;
}

/** Drop every registered handler. Plugin re-registration starts from empty. */
export function clearHooks(): void {
    handlers.clear();
}
