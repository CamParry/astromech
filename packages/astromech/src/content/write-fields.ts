/**
 * The one path from what a caller sent to the fields a resource row stores:
 * merge or inherit, parse, project, prune. Every create and update of an entry,
 * a global, a user and a media item goes through it.
 */

import type { ResourceSpec } from './resources';
import type { ScannedRow } from './unique';
import type { DataField } from '@/types/fields';
import type { EntryStatus, JsonObject, ResolvedConfig, User } from '@/types/index';
import { resourceExistenceRepository } from '@/content/repository/resource-existence';
import { entryValidationMode } from '@/entries/validation-mode';
import { flattenFieldNodes } from '@/fields/flatten';
import { parseFields } from '@/fields/parse-fields';
import { mergePatch, projectToSchema } from '@/fields/values';
import { parseOutput } from '@/services/parse-method-output';
import { pruneDanglingRelations } from './dangling-relations';
import { isUniqueAmong } from './unique';

/** What the field parse needs to know about the write, beyond the values. */
export type FieldWrite = {
    /** The entry type or global key; users and media have none. */
    target?: string | undefined;
    operation: 'create' | 'update';
    /** The row as it stands, handed to validators; null on a create. */
    record: unknown;
    user: User | null;
    /** The status the row has after the write; it decides the validation mode. */
    status?: EntryStatus | undefined;
    /** The rows a `unique` field is checked against. */
    scan: () => Promise<readonly ScannedRow[]>;
    /** Rows the uniqueness scan ignores: usually the row being written. */
    excludeId?: string | readonly string[] | undefined;
    /** Root field names new in this write; absent coerces every field. */
    coerceOnly?: ReadonlySet<string> | undefined;
};

/** Where the values come from before the parse. */
export type FieldSource =
    /** Taken as they are: a create, or a staged change being merged. */
    | { values: Record<string, unknown> }
    /**
     * A patch over a stored row: an omitted field keeps its stored value, an
     * explicit `null` stores null, and an array or container replaces wholesale.
     * Only the patched fields are coerced, and keys the schema no longer
     * declares are dropped.
     */
    | { base: JsonObject; patch: Record<string, unknown> }
    /**
     * A new translation: shared (`translatable: false`) fields come from the
     * resource's default-locale row rather than from the values sent.
     */
    | {
          values: Record<string, unknown>;
          inherit: (values: Record<string, unknown>) => Promise<Record<string, unknown>>;
      };

/**
 * The context `parseFields` runs with for one write to a resource: the
 * validation mode its status implies, its uniqueness scan, its validator.
 */
export function fieldParseContext(
    spec: ResourceSpec,
    config: ResolvedConfig,
    write: FieldWrite
): Parameters<typeof parseFields>[2] {
    const validate = spec.validate(config, write.target);
    return {
        operation: write.operation,
        validation: entryValidationMode({
            status: write.status,
            hasStatuses: spec.hasStatuses(config, write.target),
        }),
        resource: { kind: spec.kind, record: write.record },
        user: write.user,
        isUnique: isUniqueAmong(write.scan, write.excludeId),
        entryTypes: (ids) => resourceExistenceRepository.findEntryTypes(ids),
        ...(write.coerceOnly !== undefined ? { coerceOnly: write.coerceOnly } : {}),
        ...(validate !== undefined ? { validate } : {}),
    };
}

/**
 * The fields a write stores. Throws a 422 when a field or the resource's own
 * validator reports. The prune runs after the parse, whose minted item ids the
 * traversal needs, and before the write, so the index derives from its result.
 */
export async function writeFields(
    spec: ResourceSpec,
    config: ResolvedConfig,
    source: FieldSource,
    write: FieldWrite
): Promise<JsonObject> {
    const definitions = definitionsOf(spec, config, write.target);
    const merging = 'base' in source;
    const values = merging
        ? mergePatch(source.base, source.patch)
        : 'inherit' in source
          ? await source.inherit(source.values)
          : source.values;

    const parsed = await parseFields(
        values,
        definitions,
        fieldParseContext(spec, config, {
            ...write,
            // Validators are site and plugin code, so they read the public shape.
            record:
                write.record === null
                    ? null
                    : parseOutput(
                          spec.outputSchema,
                          write.record,
                          `The ${spec.kind} a field validator reads`
                      ),
            ...(merging ? { coerceOnly: new Set(patchedFieldNames(source.patch)) } : {}),
        })
    );
    const pruned = await pruneDanglingRelations(
        config,
        definitions,
        (merging ? projectToSchema(parsed, definitions) : parsed) as JsonObject
    );
    return pruned.values;
}

/** The target's top-level data fields, layout fields unwrapped. */
export function definitionsOf(
    spec: ResourceSpec,
    config: ResolvedConfig,
    target?: string
): DataField[] {
    return flattenFieldNodes(spec.fields(config, target));
}

/** Root field names a patch sends; an `undefined` value is absent. */
export function patchedFieldNames(patch: Record<string, unknown>): string[] {
    return Object.keys(patch).filter((name) => patch[name] !== undefined);
}
