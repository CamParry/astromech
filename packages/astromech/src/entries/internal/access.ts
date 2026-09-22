/**
 * The access rules the entries methods declare. One rule for every entry type,
 * not one per type: the permissions depend on the call's `type`, its payload and
 * its shape, so it is the function form of `ServiceMethodAccess`.
 */

import type { EntryAction } from '@/permissions/entry-permission';
import type { Permission, ServiceMethodAccess } from '@/types/index';
import { PERMISSION_ENTRY_READ_FULL } from '@/permissions/core-permissions';
import { entryPermission } from '@/permissions/entry-permission';

/**
 * The gate for a method acting as `action`: that action on every type the call
 * names. A write whose payload makes the entry live (`status: 'published'` in
 * `data`, or in `duplicate`'s `overrides`) demands the publish permission too,
 * and `full: true` demands `entry:read:full`, on every method, so a new option
 * cannot grow a way round it.
 */
export function entryGate(action: EntryAction): ServiceMethodAccess {
    return (input) => {
        const types = typesOf(input);
        const demanded: Permission[] = types.map((type) => entryPermission(type, action));
        if (action !== 'publish' && publishesOnWrite(input)) {
            demanded.push(...types.map((type) => entryPermission(type, 'publish')));
        }
        if (wantsFullShape(input)) demanded.push(PERMISSION_ENTRY_READ_FULL);
        return demanded;
    };
}

/**
 * The types one call names: one, or each of a cross-type query's list. A call
 * naming none, or naming one badly, resolves to the empty type, whose permission
 * (`entry::read`) only a wildcard grant holds, so the gate refuses every
 * narrower role and the method's own parse names the real problem.
 */
function typesOf(input: unknown): string[] {
    if (typeof input !== 'object' || input === null) return [''];
    const { type } = input as { type?: unknown };
    const types: unknown[] = Array.isArray(type) ? type : [type];
    const named = types.every((t) => typeof t === 'string' && t.length > 0);
    return named && types.length > 0 ? (types as string[]) : [''];
}

/** Whether a write's payload sets `status: 'published'`. */
function publishesOnWrite(input: unknown): boolean {
    if (typeof input !== 'object' || input === null) return false;
    const { data, overrides } = input as { data?: unknown; overrides?: unknown };
    return [data, overrides].some(
        (payload) =>
            typeof payload === 'object' &&
            payload !== null &&
            (payload as { status?: unknown }).status === 'published'
    );
}

/** Whether the call asks for the full (admin) shape rather than the public one. */
function wantsFullShape(input: unknown): boolean {
    if (typeof input !== 'object' || input === null) return false;
    return (input as { full?: unknown }).full === true;
}
