/**
 * The access rules the entries methods declare. One rule for every entry type,
 * not one per type: the permission depends on the `type` a call names, so it is
 * the function form of `ServiceMethodAccess` rather than a fixed string.
 */

import type { EntryAction } from '@/permissions/entry-permission';
import type { ServiceMethodAccess } from '@/types/index';
import { entryPermission } from '@/permissions/entry-permission';

/**
 * The type one call names. A call with no type is not refused here: it resolves
 * to the empty type, whose permission (`entry::read`) no role holds, so the gate
 * fails closed and the service throws the error that names the real problem. A
 * list of types resolves to the empty type too — one permission cannot cover a
 * cross-type query, and `scopeEntries` checks each of them instead.
 */
function typeOf(input: unknown): string {
    if (typeof input !== 'object' || input === null) return '';
    const { type } = input as { type?: unknown };
    return typeof type === 'string' ? type : '';
}

/** The gate for a method whose action is the same for every call. */
export function entryGate(action: EntryAction): ServiceMethodAccess {
    return (input) => entryPermission(typeOf(input), action);
}
