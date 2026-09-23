/**
 * One entry type's method catalogue. The catalogue is per type, not a constant:
 * permission, schemas and capability gating all vary with the entry type, so the
 * manifest generator and the REST mount call this factory once per type.
 */
import type { EntriesMethods } from './service';
import type { Capability } from '@/entries/capabilities';
import type { ServiceMethodContract } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { sortSchema } from '@/content/list';
import { isCapability } from '@/entries/capabilities';
import { resolveAccess } from '@/permissions/access';
import {
    createEntrySchema,
    duplicateOverridesSchema,
    previewTokenSchema,
    scheduleEntrySchema,
    updateEntrySchema,
} from './schema';
import { entriesDefinition } from './service';

/** A key on `EntriesService` — the manifest name is `entries.<key>`. */
export type EntryMethodName = keyof EntriesMethods;

/**
 * The full method catalogue for one entry type, keyed as `EntriesService` keys
 * its methods.
 *
 * @param typeId Qualified type id the service is called with — bare for a root
 *   type (`posts`), `<namespace>/<type>` for a plugin type.
 * @param titled Whether the type carries a title, which drives the create and
 *   update schemas.
 */
export function entryCatalogue(params: {
    typeId: string;
    titled: boolean;
}): Record<EntryMethodName, ServiceMethodContract & { requires?: Capability }> {
    const { typeId, titled } = params;

    const schemas = entryInputSchemas(typeId, titled);

    return Object.fromEntries(
        Object.entries(entriesDefinition.catalogue).map(([key, method]) => {
            const name = key as EntryMethodName;
            // The shared declaration states the permission as a function of the
            // call's `type`, which nothing reading a catalogue can evaluate — it
            // guards before any argument object exists. Fixed to this type here,
            // where a bare `{ type }` names exactly one permission.
            const resolved = resolveAccess(method.access, { type: typeId });
            return [
                name,
                {
                    ...method,
                    summary: entryMethodSummary(name, typeId),
                    access:
                        resolved.kind === 'permission'
                            ? resolved.permissions[0]
                            : resolved.kind,
                    input: schemas[name],
                    ...(method.requires !== undefined
                        ? { requires: capabilityRequired(method.requires, name) }
                        : {}),
                },
            ];
        })
    ) as unknown as Record<
        EntryMethodName,
        ServiceMethodContract & { requires?: Capability }
    >;
}

/**
 * A method's `requires` as an entry capability. It is typed `string` on the
 * common method shape, so a value no entry type can declare is a wiring error
 * rather than something to pass over.
 */
function capabilityRequired(requires: string, method: EntryMethodName): Capability {
    if (!isCapability(requires)) {
        throw new Error(
            `entries.${method} requires '${requires}', which is not an entry capability.`
        );
    }
    return requires;
}

/**
 * Human-readable summary for one entry method on one type.
 * e.g. method='query', type='posts' → 'List "posts" entries.'
 */
function entryMethodSummary(method: EntryMethodName, type: string): string {
    switch (method) {
        case 'query':
            return `List "${type}" entries.`;
        case 'get':
            return `Read a "${type}" entry.`;
        case 'create':
            return `Create a "${type}" entry.`;
        case 'update':
            return (
                `Update a "${type}" entry. Fields merge: omitted fields keep ` +
                `their current value, and arrays are replaced whole.`
            );
        case 'delete':
            return `Delete a "${type}" entry.`;
        case 'duplicate':
            return `Copy a "${type}" entry into a new one.`;
        case 'publish':
            return `Publish a "${type}" entry.`;
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
        case 'usedBy':
            return `List what references a "${type}" entry.`;
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
}

const limitParam = z.union([z.number(), z.literal('all')]);

/**
 * The call schema each method takes for one type: the type is a literal, and the
 * create and update payloads are the schemas that type actually validates with.
 */
function entryInputSchemas(
    typeId: string,
    titled: boolean
): Record<EntryMethodName, z.ZodType> {
    const type = z.literal(typeId);
    const id = z.string();
    /** Bulk-capable methods take one id or a non-empty list of them. */
    const ids = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);
    const canonical = z.object({ type, id });
    /** A content-level method addresses one locale of the entry. */
    const locale = z.string().optional();
    const localised = z.object({ type, id, locale });

    return {
        query: z.object({
            type,
            search: z.string().optional(),
            where: z.record(z.string(), z.unknown()).optional(),
            trashed: z.boolean().optional(),
            page: z.number().optional(),
            limit: limitParam.optional(),
            sort: sortSchema,
            locale: z.string().optional(),
            full: z.boolean().optional(),
            previewToken: z.string().optional(),
            staged: z.boolean().optional(),
        }),
        get: z.object({
            type,
            id,
            locale: z.string().optional(),
            full: z.boolean().optional(),
            previewToken: z.string().optional(),
            staged: z.boolean().optional(),
        }),
        create: z.object({ type, data: createEntrySchema({ titled }) }),
        update: z.object({
            type,
            id: ids,
            locale,
            staged: z.boolean().optional(),
            data: updateEntrySchema({ titled }),
        }),
        delete: z.object({ type, id: ids }),
        duplicate: z.object({
            type,
            id,
            overrides: duplicateOverridesSchema.optional(),
        }),
        trash: z.object({ type, id: ids }),
        restore: z.object({ type, id: ids }),
        emptyTrash: z.object({ type }),
        versions: localised,
        restoreVersion: z.object({ type, id, locale, versionId: z.string() }),
        publish: z.object({ type, id: ids, locale }),
        unpublish: z.object({ type, id: ids, locale }),
        schedule: z.object({ type, id: ids, locale }).extend(scheduleEntrySchema.shape),
        usedBy: canonical,
        createStaged: localised,
        getStaged: localised,
        mergeStaged: localised,
        deleteStaged: localised,
        // `previewTokenSchema` coerces an ISO string, which is what a JSON
        // caller sends and what the REST route has always accepted.
        issuePreviewToken: z.object({ type, id }).extend(previewTokenSchema.shape),
        revokePreviewToken: canonical,
    };
}
