/**
 * The access rules the globals methods declare. One rule for every global, not
 * one per global: the permission depends on the `key` a call names, so it is the
 * function form of `PermissionRule` rather than a fixed string.
 */

import type { GlobalAction } from '@/permissions/global-permission';
import type { PermissionRule } from '@/types/index';
import { getConfig } from '@/config/registry';
import { globalPermission } from '@/permissions/global-permission';
import { findGlobal } from './global';

/**
 * The key one call names. A call with no key is not refused here: it resolves to
 * the empty key, whose permission (`global::read`) no role holds, so the guard
 * fails closed and the service throws the error that names the real problem.
 */
export function keyOf(input: unknown): string {
    if (typeof input !== 'object' || input === null) return '';
    const { key } = input as { key?: unknown };
    return typeof key === 'string' ? key : '';
}

/** True when the call asks for a shape only an authenticated read may have. */
export function wantsPrivateShape(input: unknown): boolean {
    if (typeof input !== 'object' || input === null) return false;
    const { full, staged } = input as { full?: unknown; staged?: unknown };
    return full === true || staged === true;
}

/** The gate for a method whose action is the same for every call. */
export function gate(action: GlobalAction): PermissionRule {
    return (input) => globalPermission(keyOf(input), action);
}

/**
 * `get`'s gate. A `public` global's plain read is what an unauthenticated
 * visitor makes, so it needs no permission; the `full` and `staged` shapes are a
 * second axis of authority and always do.
 */
export const readGate: PermissionRule = (input) => {
    const key = keyOf(input);
    // The one config read left under `globals/`: an access rule is a function of
    // the input alone, called before a method's handler and so before there is a
    // `ctx` to take the config from.
    if (!wantsPrivateShape(input) && findGlobal(getConfig(), key)?.public === true) {
        return null;
    }
    return globalPermission(key, 'read');
};
