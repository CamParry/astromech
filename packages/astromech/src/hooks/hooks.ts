/**
 * The hook runner: `addHook` registers a handler, and `runHook` awaits an event's
 * handlers in registration order (a non-`undefined` return replaces the payload
 * for the next one and for the caller). No try/catch: a handler throw propagates.
 */

import type { AppContext } from '@/types/app-context';
import type { HookEvent, HookPayloadFor } from '@/types/hooks';
import { createKeyedRegistry } from '@/registry';

/**
 * A hook handler: reads the payload and the context of the call that fired it,
 * may return a replacement, may throw.
 */
// `void` in the union (not `undefined`) is what lets a handler omit `return`.
/* eslint-disable @typescript-eslint/no-invalid-void-type */
export type HookCallback<Payload> = (
    payload: Payload,
    ctx: AppContext
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
 * Run `event`'s handlers in registration order, each with `ctx`, the context
 * of the call that fired it. A handler's non-`undefined` return replaces the
 * payload for the next handler and is what this resolves to; a handler throw
 * propagates from here to the caller.
 */
export async function runHook<E extends HookEvent>(
    event: E,
    payload: HookPayloadFor<E>,
    ctx: AppContext
): Promise<HookPayloadFor<E>> {
    let current: unknown = payload;
    for (const handler of handlers.get(event) ?? []) {
        const result = await handler(current, ctx);
        if (result !== undefined) current = result;
    }
    return current as HookPayloadFor<E>;
}

/** Drop every registered handler. Plugin re-registration starts from empty. */
export function clearHooks(): void {
    handlers.clear();
}
