/**
 * Entries service method descriptors.
 *
 * Entries is the one domain whose catalogue is PER TYPE rather than a constant:
 * the permission, the create/update schemas (whether a title is required) and
 * the capability gating all vary with the entry type. So this is a factory the
 * method-manifest generator calls once per configured type — the schemas are
 * authored here, in the domain, not in the generator.
 *
 * `input` is the METHOD's argument object: every `EntriesApi` method takes
 * `{ type, ... }`, and `type` is fixed per descriptor because a descriptor
 * describes one type's methods.
 */

import { z } from '@hono/zod-openapi';
import type { ServiceMethodDescriptor } from '@/types/index.js';
import { entryPermission, type EntryAction } from '@/permissions/entry-permission.js';
import { parseEntryTypeId } from './type-registry.js';
import { createEntrySchemaFor, updateEntrySchemaFor } from './schema.js';

/**
 * A per-type entry method descriptor. Adds the two facts the manifest needs
 * which a plain descriptor has no field for: which `EntriesApi` method it
 * describes, and the capability the entry type must declare for the method to
 * exist at all.
 */
export type EntryMethodDescriptor = ServiceMethodDescriptor & {
    /** Key on `EntriesApi` — the manifest name is `entries.<method>`. */
    method: string;
    /**
     * Capability gate: `publish` needs `versioning`; the staged-entry/preview
     * methods need `staging`. Absent ⇒ the method is always available. The
     * action the method enforces against is separate — `mergeStaged` enforces
     * `publish` but is gated on `staging`.
     */
    requires?: 'versioning' | 'staging';
};

/**
 * Human-readable summary for an entry method.
 * e.g. method='query', type='posts' → 'List "posts" entries.'
 */
function entryMethodSummary(method: string, action: EntryAction, type: string): string {
    switch (method) {
        case 'query':
            return `List "${type}" entries.`;
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
export function entryMethodDescriptors(params: {
    typeId: string;
    titleField: 'title' | false;
}): EntryMethodDescriptor[] {
    const { typeId, titleField } = params;

    // Summaries name the BARE type: a plugin type's qualified id is an address,
    // not a label.
    const label = parseEntryTypeId(typeId)?.type ?? typeId;

    const type = z.literal(typeId);
    const id = z.string();
    /** Bulk-capable methods take one id or an array of them. */
    const ids = z.union([z.string(), z.array(z.string())]);
    const canonical = z.object({ type, id });

    /** The facts every entry method derives from its (method, action) pair. */
    const base = (method: string, action: EntryAction) => ({
        method,
        summary: entryMethodSummary(method, action, label),
        permission: entryPermission(typeId, action),
        mutates: action !== 'read',
        destructive: action === 'delete',
    });

    return [
        {
            ...base('query', 'read'),
            input: z.object({
                type,
                search: z.string().optional(),
                where: z.record(z.string(), z.unknown()).optional(),
                trashed: z.boolean().optional(),
                page: z.number().optional(),
                limit: limitParam.optional(),
                sort: sortParam.optional(),
                populate: z.array(z.string()).optional(),
                locale: z.string().optional(),
                full: z.boolean().optional(),
                previewToken: z.string().optional(),
                staged: z.boolean().optional(),
            }),
        },
        {
            ...base('get', 'read'),
            input: z.object({
                type,
                id,
                locale: z.string().optional(),
                populate: z.array(z.string()).optional(),
                full: z.boolean().optional(),
                previewToken: z.string().optional(),
                staged: z.boolean().optional(),
            }),
        },
        {
            ...base('create', 'create'),
            input: createEntrySchemaFor(titleField).extend({ type }),
        },
        {
            ...base('update', 'update'),
            // Re-applying the same update lands the same end-state — matches the
            // core `users.update`/`settings.set` idempotent hint.
            idempotent: true,
            input: z.object({ type, id: ids, data: updateEntrySchemaFor(titleField) }),
        },
        {
            ...base('delete', 'delete'),
            input: z.object({
                type,
                id: ids,
                cascadeLocales: z.boolean().optional(),
            }),
        },
        {
            ...base('publish', 'publish'),
            requires: 'versioning',
            input: z.object({ type, id: ids }),
        },
        { ...base('createStaged', 'update'), requires: 'staging', input: canonical },
        { ...base('getStaged', 'read'), requires: 'staging', input: canonical },
        { ...base('mergeStaged', 'publish'), requires: 'staging', input: canonical },
        { ...base('deleteStaged', 'update'), requires: 'staging', input: canonical },
        {
            ...base('issuePreviewToken', 'update'),
            requires: 'staging',
            input: z.object({ type, id, expiresAt: z.date().nullable().optional() }),
        },
        {
            ...base('revokePreviewToken', 'update'),
            requires: 'staging',
            input: canonical,
        },
    ];
}
