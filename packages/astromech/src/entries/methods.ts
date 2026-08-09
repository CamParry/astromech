/**
 * Entries service method contracts.
 *
 * Entries is the one domain whose catalogue is PER TYPE rather than a constant:
 * the permission, the create/update schemas (whether a title is required) and
 * the capability gating all vary with the entry type. So this is a factory the
 * method-manifest generator calls once per configured type — the schemas are
 * authored here, in the domain, not in the generator.
 *
 * `input` is the METHOD's argument object: every `EntriesService` method takes
 * `{ type, ... }`, and `type` is fixed per contract because a contract
 * describes one type's methods.
 */

import { z } from '@hono/zod-openapi';
import type { ServiceMethodContract } from '@/types/index';
import { entryPermission, type EntryAction } from '@/permissions/entry-permission';
import { parseEntryTypeId } from './type-ids';
import type { Capability } from './storage/capabilities';
import {
    createEntrySchemaFor,
    duplicateOverridesSchema,
    scheduleEntrySchema,
    updateEntrySchemaFor,
} from './schema';

/**
 * A per-type entry method contract. Adds the two facts the manifest needs
 * which a plain contract has no field for: which `EntriesService` method it
 * describes, and the capability the entry type must declare for the method to
 * exist at all.
 */
export type EntryMethodContract = ServiceMethodContract & {
    /** Key on `EntriesService` — the manifest name is `entries.<method>`. */
    method: string;
    /**
     * Capability gate — the SAME capability the service asserts, so the manifest
     * advertises a method exactly when calling it would succeed. `publish` is
     * gated on `statuses` because that is what `operations/status.ts` asserts;
     * it was gated on `versioning` until P1, which hid publish/unpublish from
     * every unversioned type while the service accepted the call. Absent ⇒
     * always available. The action the method enforces against is separate —
     * `mergeStaged` enforces `publish` but is gated on `staging`.
     */
    requires?: Capability;
};

/**
 * Human-readable summary for an entry method.
 * e.g. method='query', type='posts' → 'List "posts" entries.'
 */
function entryMethodSummary(method: string, action: EntryAction, type: string): string {
    switch (method) {
        case 'query':
            return `List "${type}" entries.`;
        case 'update':
            return (
                `Update a "${type}" entry. Fields merge: omitted fields keep ` +
                `their current value, and arrays are replaced whole.`
            );
        case 'duplicate':
            return `Copy a "${type}" entry into a new one.`;
        case 'unpublish':
            return `Unpublish a "${type}" entry.`;
        case 'schedule':
            return `Schedule a "${type}" entry to publish at a future time.`;
        case 'trash':
            return `Move a "${type}" entry to the trash (reversible).`;
        case 'restore':
            return `Restore a trashed "${type}" entry.`;
        case 'emptyTrash':
            return `Permanently delete every trashed "${type}" entry.`;
        case 'versions':
            return `List the version history of a "${type}" entry.`;
        case 'restoreVersion':
            return `Roll a "${type}" entry back to an earlier version.`;
        case 'incomingRelationships':
            return `List the entries that reference a "${type}" entry.`;
        case 'createStaged':
            return `Stage a change to a "${type}" entry.`;
        case 'getStaged':
            return `Get the staged change of a "${type}" entry.`;
        case 'mergeStaged':
            return `Merge the staged change into a "${type}" entry.`;
        case 'deleteStaged':
            return `Discard the staged change of a "${type}" entry.`;
        case 'issuePreviewToken':
            return `Issue a preview token for a "${type}" entry.`;
        case 'revokePreviewToken':
            return `Revoke the preview token of a "${type}" entry.`;
    }
    const verb = action.charAt(0).toUpperCase() + action.slice(1);
    return `${verb} a "${type}" entry.`;
}

/**
 * The permission action each `EntriesService` method enforces.
 *
 * Declared once and read by both consumers: the contracts below (which project
 * it into the manifest's `permission`) and the scoped entries handle (which
 * resolves it at call time). Restating the pairs at the call site would be a
 * second declaration of the same fact, and the enforcement half is exactly the
 * half that must not drift.
 *
 * Covers every key on `EntriesService`; a key missing here has no derivable
 * permission and the scoped handle refuses it.
 */
export const ENTRY_METHOD_ACTIONS = {
    query: 'read',
    get: 'read',
    create: 'create',
    update: 'update',
    delete: 'delete',
    duplicate: 'create',
    trash: 'delete',
    restore: 'update',
    emptyTrash: 'delete',
    versions: 'read',
    restoreVersion: 'update',
    publish: 'publish',
    unpublish: 'publish',
    schedule: 'publish',
    incomingRelationships: 'read',
    createStaged: 'update',
    getStaged: 'read',
    // Merging a staged change is what makes it live — enforced as a publish even
    // though the capability gating it is `staging`.
    mergeStaged: 'publish',
    deleteStaged: 'update',
    issuePreviewToken: 'update',
    revokePreviewToken: 'update',
} as const satisfies Record<string, EntryAction>;

/** A key on `EntriesService` whose permission action is known. */
export type EntryMethodName = keyof typeof ENTRY_METHOD_ACTIONS;

const sortDirection = z.enum(['asc', 'desc']);

const sortParam = z.union([
    z.record(z.string(), sortDirection),
    z.array(z.record(z.string(), sortDirection)),
]);

const limitParam = z.union([z.number(), z.literal('all')]);

/**
 * The full method catalogue for one entry type, in the logical CRUD+publish
 * order followed by the forward-versioning (staged entries) methods.
 *
 * @param typeId Qualified type id the service is called with — bare for a root
 *   type (`posts`), `<namespace>/<type>` for a plugin type.
 * @param titleField The type's title requirement, which drives the create and
 *   update schemas.
 */
export function entryMethodContracts(params: {
    typeId: string;
    titleField: 'title' | false;
}): EntryMethodContract[] {
    const { typeId, titleField } = params;

    // Summaries name the BARE type: a plugin type's qualified id is an address,
    // not a label.
    const label = parseEntryTypeId(typeId)?.type ?? typeId;

    const type = z.literal(typeId);
    const id = z.string();
    /** Bulk-capable methods take one id or an array of them. */
    const ids = z.union([z.string(), z.array(z.string())]);
    const canonical = z.object({ type, id });

    /**
     * The facts every entry method derives from its action. The action comes
     * from {@link ENTRY_METHOD_ACTIONS} rather than being passed in, so the
     * (method, action) pairing is declared exactly once.
     */
    const base = (method: EntryMethodName) => {
        const action = ENTRY_METHOD_ACTIONS[method];
        return {
            method,
            summary: entryMethodSummary(method, action, label),
            permission: entryPermission(typeId, action),
            mutates: action !== 'read',
            destructive: action === 'delete',
        };
    };

    return [
        {
            ...base('query'),
            input: z.object({
                type,
                search: z.string().optional(),
                where: z.record(z.string(), z.unknown()).optional(),
                trashed: z.boolean().optional(),
                page: z.number().optional(),
                limit: limitParam.optional(),
                sort: sortParam.optional(),
                locale: z.string().optional(),
                full: z.boolean().optional(),
                previewToken: z.string().optional(),
                staged: z.boolean().optional(),
            }),
        },
        {
            ...base('get'),
            input: z.object({
                type,
                id,
                locale: z.string().optional(),
                full: z.boolean().optional(),
                previewToken: z.string().optional(),
                staged: z.boolean().optional(),
            }),
        },
        {
            ...base('create'),
            input: createEntrySchemaFor(titleField).extend({ type }),
        },
        {
            ...base('update'),
            // Re-applying the same update lands the same end-state — matches the
            // core `users.update`/`settings.set` idempotent hint.
            idempotent: true,
            input: z.object({ type, id: ids, data: updateEntrySchemaFor(titleField) }),
        },
        {
            ...base('delete'),
            input: z.object({
                type,
                id: ids,
                cascadeLocales: z.boolean().optional(),
            }),
        },
        {
            ...base('duplicate'),
            input: z.object({
                type,
                id,
                overrides: duplicateOverridesSchema.optional(),
            }),
        },
        {
            ...base('trash'),
            requires: 'trash',
            // NOT destructive: trash is the reversible half of the delete pair —
            // `restore` undoes it. `emptyTrash` and `delete` are the ones that
            // lose data, and both keep the flag `base()` derives.
            destructive: false,
            idempotent: true,
            input: z.object({
                type,
                id: ids,
                cascadeLocales: z.boolean().optional(),
            }),
        },
        {
            ...base('restore'),
            requires: 'trash',
            idempotent: true,
            input: z.object({ type, id: ids }),
        },
        {
            ...base('emptyTrash'),
            requires: 'trash',
            idempotent: true,
            input: z.object({ type }),
        },
        {
            ...base('versions'),
            requires: 'versioning',
            input: canonical,
        },
        {
            ...base('restoreVersion'),
            requires: 'versioning',
            idempotent: true,
            input: z.object({ type, id, versionId: z.string() }),
        },
        {
            ...base('publish'),
            requires: 'statuses',
            idempotent: true,
            input: z.object({ type, id: ids }),
        },
        {
            ...base('unpublish'),
            requires: 'statuses',
            // Data-losing in the sense the effect hints mean: the entry stops
            // being served. `ServiceMethodEffect` names unpublish explicitly.
            destructive: true,
            idempotent: true,
            input: z.object({ type, id: ids }),
        },
        {
            ...base('schedule'),
            requires: 'statuses',
            idempotent: true,
            input: z.object({ type, id: ids }).extend(scheduleEntrySchema.shape),
        },
        { ...base('incomingRelationships'), input: canonical },
        { ...base('createStaged'), requires: 'staging', input: canonical },
        { ...base('getStaged'), requires: 'staging', input: canonical },
        { ...base('mergeStaged'), requires: 'staging', input: canonical },
        { ...base('deleteStaged'), requires: 'staging', input: canonical },
        {
            ...base('issuePreviewToken'),
            requires: 'staging',
            input: z.object({ type, id, expiresAt: z.date().nullable().optional() }),
        },
        {
            ...base('revokePreviewToken'),
            requires: 'staging',
            input: canonical,
        },
    ];
}
