/**
 * One entry type's method catalogue. The catalogue is per type, not a constant:
 * permission, schemas and capability gating all vary with the entry type, so the
 * manifest generator and the REST mount call this factory once per type.
 */
import type { Capability } from '@/entries/capabilities';
import type { EntriesService, ServiceMethodContract } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { isCapability } from '@/entries/capabilities';
import { resolveAccess } from '@/permissions/access';
import { createEntryInput } from './methods/create';
import { deleteEntriesInput } from './methods/delete';
import { duplicateEntryInput } from './methods/duplicate';
import { getEntryInput } from './methods/get';
import { issuePreviewTokenInput, revokePreviewTokenInput } from './methods/preview/token';
import { queryEntriesInput } from './methods/query';
import { restoreEntriesInput } from './methods/restore';
import { createStagedEntryInput } from './methods/staging/create';
import { deleteStagedEntryInput } from './methods/staging/delete';
import { getStagedEntryInput } from './methods/staging/get';
import { mergeStagedEntryInput } from './methods/staging/merge';
import {
    publishEntriesInput,
    scheduleEntriesInput,
    unpublishEntriesInput,
} from './methods/status';
import { emptyTrashInput, trashEntriesInput } from './methods/trash';
import { updateEntriesInput } from './methods/update';
import { listEntryUsageInput } from './methods/used-by';
import { getEntryVersionInput } from './methods/versions/get';
import { listEntryVersionsInput } from './methods/versions/list';
import { restoreEntryVersionInput } from './methods/versions/restore';
import { createEntrySchema, updateEntrySchema } from './schema';
import { entriesDefinition } from './service';

/** A key on `EntriesService` — the manifest name is `entries.<key>`. */
export type EntryMethodName = keyof EntriesService;

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
        case 'getVersion':
            return `Read one version of a "${type}" entry.`;
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

/**
 * The call schema each method takes for one type: each method's own input
 * builder with `type` as a literal, and the create and update payloads as the
 * schemas that type actually validates with.
 */
function entryInputSchemas(
    typeId: string,
    titled: boolean
): Record<EntryMethodName, z.ZodType> {
    const type = z.literal(typeId);
    return {
        query: queryEntriesInput({ type }),
        get: getEntryInput({ type }),
        create: createEntryInput({ type, data: createEntrySchema({ titled }) }),
        update: updateEntriesInput({ type, data: updateEntrySchema({ titled }) }),
        delete: deleteEntriesInput({ type }),
        duplicate: duplicateEntryInput({ type }),
        trash: trashEntriesInput({ type }),
        restore: restoreEntriesInput({ type }),
        emptyTrash: emptyTrashInput({ type }),
        versions: listEntryVersionsInput({ type }),
        getVersion: getEntryVersionInput({ type }),
        restoreVersion: restoreEntryVersionInput({ type }),
        publish: publishEntriesInput({ type }),
        unpublish: unpublishEntriesInput({ type }),
        schedule: scheduleEntriesInput({ type }),
        usedBy: listEntryUsageInput({ type }),
        createStaged: createStagedEntryInput({ type }),
        getStaged: getStagedEntryInput({ type }),
        mergeStaged: mergeStagedEntryInput({ type }),
        deleteStaged: deleteStagedEntryInput({ type }),
        issuePreviewToken: issuePreviewTokenInput({ type }),
        revokePreviewToken: revokePreviewTokenInput({ type }),
    };
}
