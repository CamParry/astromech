/**
 * One entry type's method catalogue. The catalogue is per type, not a constant:
 * permission, schemas and capability gating all vary with the entry type, so the
 * manifest generator and the REST mount call this factory once per type.
 */
import type { Capability } from '@/entries/capabilities';
import type {
    EntriesService,
    Permission,
    ResolvedEntryType,
    ServiceMethodContract,
} from '@/types/index';
import { z } from '@hono/zod-openapi';
import { declaresCapability } from '@/content/capabilities';
import { availableMethodPermissions } from '@/content/method-permissions';
import { isCapability } from '@/entries/capabilities';
import { resolveAccess } from '@/permissions/access';
import { createEntrySchema, updateEntrySchema } from './schema';
import { entriesDefinition } from './service';

/** A key on `EntriesService` — the manifest name is `entries.<key>`. */
export type EntryMethodName = keyof EntriesService;

/** One entry method fixed to a type, with its `requires` narrowed to an entry capability. */
type EntryMethodContract = ServiceMethodContract & { requires?: Capability };

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
}): Record<EntryMethodName, EntryMethodContract> {
    const { typeId, titled } = params;
    const type = z.literal(typeId);
    const typeSentence = `Entry type: "${typeId}".`;
    // The create and update payloads as the schemas this type validates with.
    const payloads: Partial<Record<EntryMethodName, Record<string, z.ZodType>>> = {
        create: { data: createEntrySchema({ titled }) },
        update: { data: updateEntrySchema({ titled }) },
    };

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
                    summary:
                        method.summary === undefined
                            ? typeSentence
                            : `${method.summary} ${typeSentence}`,
                    access:
                        resolved.kind === 'permission'
                            ? resolved.permissions[0]
                            : resolved.kind,
                    input: objectInput(method.input, name).safeExtend({
                        type,
                        ...payloads[name],
                    }),
                    ...(method.requires !== undefined
                        ? { requires: capabilityRequired(method.requires, name) }
                        : {}),
                },
            ];
        })
    ) as unknown as Record<EntryMethodName, EntryMethodContract>;
}

/**
 * The methods one entry type offers: its catalogue less each method whose
 * `requires` the type does not declare.
 */
export function availableEntryMethods(
    entryType: ResolvedEntryType
): Partial<Record<EntryMethodName, EntryMethodContract>> {
    const catalogue = entryCatalogue({
        typeId: entryType.id,
        titled: entryType.titleField !== false,
    });
    return Object.fromEntries(
        Object.entries(catalogue).filter(([, contract]) =>
            declaresCapability(entryType, contract.requires)
        )
    );
}

/** The permissions the methods one entry type offers demand, each named once. */
export function entryMethodPermissions(entryType: ResolvedEntryType): Permission[] {
    return availableMethodPermissions(
        entryType,
        Object.values(entriesDefinition.catalogue),
        { type: entryType.id }
    );
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
 * A method's `input` as an object schema, which every entry method declares. It
 * is typed `ZodType` on the common method shape, so anything else is a wiring
 * error rather than an input to pass through unfixed.
 */
function objectInput(input: z.ZodType, method: EntryMethodName): z.ZodObject {
    if (!(input instanceof z.ZodObject)) {
        throw new Error(
            `entries.${method} takes a non-object input, so its type cannot be fixed.`
        );
    }
    return input;
}
