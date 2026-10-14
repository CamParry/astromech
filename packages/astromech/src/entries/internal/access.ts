import type { AccessRule } from '@/permissions/access';
import type { EntryAction } from '@/permissions/entry-permission';
import type { Permission } from '@/permissions/permission';
import { needsPublish } from '@/content/publish-access';
import { PERMISSION_ENTRY_READ_FULL } from '@/permissions/core-permissions';
import { entryPermission } from '@/permissions/entry-permission';

/**
 * The permissions an entries method needs: `action` on each type the call names,
 * plus `publish` when a create's or update's `data` or `overrides` sets a status
 * or date (`needsPublish`), and `entry:read:full` when it asks for `full` or
 * for a `draft`, which is not public.
 */
export function entryAccess(action: EntryAction): AccessRule {
    return (input) => {
        const types = typesOf(input);
        const demanded: Permission[] = types.map((type) => entryPermission(type, action));
        if (setsPublishState(input, action)) {
            demanded.push(...types.map((type) => entryPermission(type, 'publish')));
        }
        if (needsFullRead(input)) demanded.push(PERMISSION_ENTRY_READ_FULL);
        return demanded;
    };
}

/** The type one call's input names, or the empty type when it names none. */
export function typeOf(input: unknown): string {
    const type = typeField(input);
    return typeof type === 'string' ? type : '';
}

/**
 * The types one call names: one, or each of a cross-type query's list. A call
 * naming none, or naming one badly, resolves to the empty type, whose permission
 * (`entry::read`) only a wildcard grant holds, so the rule refuses every
 * narrower role and the method's own parse names the real problem.
 */
function typesOf(input: unknown): string[] {
    const type = typeField(input);
    const types: unknown[] = Array.isArray(type) ? type : [type];
    const named = types.every((t) => typeof t === 'string' && t.length > 0);
    return named && types.length > 0 ? (types as string[]) : [''];
}

/** The `type` key of a call's input, whatever it holds. */
function typeField(input: unknown): unknown {
    if (typeof input !== 'object' || input === null) return undefined;
    return (input as { type?: unknown }).type;
}

/** Whether a create's or update's payload sets a status or date only `publish` may. */
function setsPublishState(input: unknown, action: EntryAction): boolean {
    if (action !== 'create' && action !== 'update') return false;
    if (typeof input !== 'object' || input === null) return false;
    const { data, overrides } = input as { data?: unknown; overrides?: unknown };
    return [data, overrides].some((payload) => needsPublish(payload, action));
}

/** Whether the call asks for the full (admin) shape, or for a draft's content. */
function needsFullRead(input: unknown): boolean {
    if (typeof input !== 'object' || input === null) return false;
    const { full, draft } = input as { full?: unknown; draft?: unknown };
    return full === true || draft === true;
}
