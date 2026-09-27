import type { GlobalAction } from '@/permissions/global-permission';
import type { PermissionRule } from '@/types/index';
import { getConfig } from '@/config/registry';
import { globalPermission } from '@/permissions/global-permission';
import { resolveGlobal } from '../resolve-global';

/**
 * The permission a globals method needs. It names the global the call's `key`
 * addresses, so one rule serves every global.
 */
export function globalAccess(action: GlobalAction): PermissionRule {
    return (input) => globalPermission(keyOf(input), action);
}

/**
 * `get`'s rule. A `public` global's plain read needs no permission; the `full`
 * and `staged` shapes always need `read`.
 */
export const readGate: PermissionRule = (input) => {
    const key = keyOf(input);
    // The one config read left under `globals/`: an access rule is a function of
    // the input alone, called before a method's handler and so before there is a
    // `ctx` to take the config from.
    if (!wantsPrivateShape(input) && resolveGlobal(getConfig(), key)?.public === true) {
        return null;
    }
    return globalPermission(key, 'read');
};

/**
 * The key one call names. A call with no key resolves to the empty key, whose
 * permission no role holds, so the rule fails closed and the handler throws the
 * error that names the real problem.
 */
function keyOf(input: unknown): string {
    if (typeof input !== 'object' || input === null) return '';
    const { key } = input as { key?: unknown };
    return typeof key === 'string' ? key : '';
}

/** True when the call asks for a shape only an authenticated read may have. */
function wantsPrivateShape(input: unknown): boolean {
    if (typeof input !== 'object' || input === null) return false;
    const { full, staged } = input as { full?: unknown; staged?: unknown };
    return full === true || staged === true;
}
