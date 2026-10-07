/**
 * The one path from what a caller sent to the fields a resource row stores:
 * merge or inherit, parse, project, prune. Every create and update of an entry,
 * a global, a user and a media item goes through it.
 */

import type { DataField } from '@/types/fields';
import type {
    EntryStatus,
    JsonObject,
    ResolvedConfig,
    ResourceType,
    User,
} from '@/types/index';
import { resourceExistenceRepository } from '@/content/repository/resource-existence';
import { flattenFieldNodes } from '@/fields/flatten';
import { parseFields } from '@/fields/parse-fields';
import { mergePatch, projectToSchema } from '@/fields/values';
import { parseOutput } from '@/services/parse-method-output';
import { pruneDanglingRelations } from './dangling-relations';
import { RESOURCE_CONFIG } from './resources';
import { resolveValidationMode } from './validation-mode';

/** What the field parse needs to know about the write, beyond the values. */
export type FieldWrite = {
    resource: ResourceType;
    config: ResolvedConfig;
    /** The entry type or global key; users and media have none. */
    target?: string | undefined;
    user: User | null;
    /** The status the row has after the write; it decides the validation mode. */
    status?: EntryStatus | undefined;
} & (
    | { operation: 'create' }
    /** `existing` is the row as it stands, handed to validators. */
    | { operation: 'update'; existing: unknown }
);

/** Where the values come from before the parse. */
export type FieldSource =
    /** Taken as they are: a create, or a staged change being merged. */
    | { values: Record<string, unknown>; base?: never; patch?: never; inherit?: never }
    /**
     * A patch over a stored row: an omitted field keeps its stored value, an
     * explicit `null` stores null, and an array or container replaces wholesale.
     * Only the patched fields are coerced, and keys the schema no longer
     * declares are dropped.
     */
    | {
          base: JsonObject;
          patch: Record<string, unknown>;
          values?: never;
          inherit?: never;
      }
    /**
     * A new translation: shared (`translatable: false`) fields come from the
     * resource's default-locale row rather than from the values sent.
     */
    | {
          values: Record<string, unknown>;
          inherit: (values: Record<string, unknown>) => Promise<Record<string, unknown>>;
          base?: never;
          patch?: never;
      };

/** `prepareFields`'s argument: the write, and where its values come from. */
export type PrepareFieldsInput = FieldWrite & FieldSource;

/**
 * The fields a write stores. Throws a 422 when a field or the resource's own
 * validator reports. The prune runs after the parse, whose minted item ids the
 * traversal needs, and before the write, so the index derives from its result.
 */
export async function prepareFields(input: PrepareFieldsInput): Promise<JsonObject> {
    const { resource, config, target } = input;
    const definitions = definitionsOf({ resource, config, target });
    const patch = input.base === undefined ? undefined : input.patch;
    const values =
        input.base !== undefined
            ? mergePatch(input.base, input.patch)
            : input.inherit !== undefined
              ? await input.inherit(input.values)
              : input.values;

    const parsed = await parseFields(
        values,
        definitions,
        fieldParseContext({
            ...input,
            // Validators are site and plugin code, so they read the public shape.
            ...(input.operation === 'update'
                ? {
                      existing: parseOutput(
                          RESOURCE_CONFIG[resource].outputSchema,
                          input.existing,
                          `The ${resource} a field validator reads`
                      ),
                  }
                : {}),
            ...(patch !== undefined
                ? { coerceOnly: new Set(patchedFieldNames(patch)) }
                : {}),
        })
    );
    const pruned = await pruneDanglingRelations(
        config,
        definitions,
        (patch !== undefined
            ? projectToSchema(parsed, definitions)
            : parsed) as JsonObject
    );
    return pruned.values;
}

/**
 * The context `parseFields` runs with for one write to a resource: the
 * validation mode its status implies and its validator.
 * `coerceOnly` names the root fields new in this write; absent coerces every field.
 */
export function fieldParseContext(
    write: FieldWrite & { coerceOnly?: ReadonlySet<string> | undefined }
): Parameters<typeof parseFields>[2] {
    const { resource, config, target } = write;
    const resourceConfig = RESOURCE_CONFIG[resource];
    const validate = resourceConfig.validate(config, target);
    return {
        operation: write.operation,
        validation: resolveValidationMode({
            status: write.status,
            hasStatuses: resourceConfig.hasStatuses(config, target),
        }),
        resource: {
            kind: resource,
            record: write.operation === 'update' ? write.existing : null,
        },
        user: write.user,
        entryTypes: (ids) => resourceExistenceRepository.findEntryTypes(ids),
        ...(write.coerceOnly !== undefined ? { coerceOnly: write.coerceOnly } : {}),
        ...(validate !== undefined ? { validate } : {}),
    };
}

/** The target's top-level data fields, layout fields unwrapped. */
export function definitionsOf({
    resource,
    config,
    target,
}: {
    resource: ResourceType;
    config: ResolvedConfig;
    target?: string | undefined;
}): DataField[] {
    return flattenFieldNodes(RESOURCE_CONFIG[resource].fields(config, target));
}

/** Root field names a patch sends; an `undefined` value is absent. */
export function patchedFieldNames(patch: Record<string, unknown>): string[] {
    return Object.keys(patch).filter((name) => patch[name] !== undefined);
}
