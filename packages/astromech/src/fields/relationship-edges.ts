/**
 * Relationship edge extraction — derives the relationships index from field
 * data via `fieldType.children()`. Only ever run this on data that has been
 * through `parseFields`; `children()` mints ids and is non-deterministic on raw input.
 */

import type { Field, FieldPathSegment } from '@/types/fields';
import { formatInstancePath, formatSchemaPath } from '@/fields/field-path';
import { getFieldType } from '@/fields/field-type-registry';
import { flattenFieldNodes } from '@/fields/flatten';
import { RESERVED_KEY } from '@/fields/reserved-keys';

/**
 * What a relation points at — the relation-eligible subset of `ResourceType`
 * (`types/domain.ts`), which also covers settings pages. Mirrors the index's
 * `targetKind` column.
 */
export type TargetKind = 'entry' | 'user' | 'media';

/** One row of the index, minus the source columns the caller owns. */
export type RelationshipEdge = {
    /** `sections[].gallery` — what a query matches on. */
    schemaPath: string;
    /** `sections[a1].gallery` — for deep-linking; never pattern-matched. */
    instancePath: string;
    targetId: string;
    targetKind: TargetKind;
};

/**
 * What a relation field points at. `media` fields are relations too — the old
 * subsystem ignored them, which is why no media row was ever written.
 */
function targetKindOf(field: Field): TargetKind {
    if (field.type === 'media') return 'media';
    return field.target === 'users' ? 'user' : 'entry';
}

/** A relation value is one id or a list of them; anything else holds no edge. */
function targetIdsOf(value: unknown): string[] {
    const raw = Array.isArray(value) ? value : [value];
    return raw.filter((id): id is string => typeof id === 'string' && id !== '');
}

function walk(
    definitions: Field[],
    values: Record<string, unknown>,
    parentSegments: readonly FieldPathSegment[],
    out: RelationshipEdge[]
): void {
    for (const field of flattenFieldNodes(definitions)) {
        const fieldType = getFieldType(field.type);
        const segments: FieldPathSegment[] = [
            ...parentSegments,
            { kind: 'field', name: field.name },
        ];
        const value = values[field.name];

        if (fieldType?.isRelation === true) {
            const targetKind = targetKindOf(field);
            const schemaPath = formatSchemaPath(segments);
            const instancePath = formatInstancePath(segments);
            for (const targetId of targetIdsOf(value)) {
                out.push({ schemaPath, instancePath, targetId, targetKind });
            }
            continue;
        }

        // Containers hand back scopes whose segments are relative to
        // themselves, so this scope's parents are prepended and deeper
        // containers accumulate — the same accumulation `processScope` does.
        if (fieldType?.children !== undefined) {
            const { scopes } = fieldType.children(field, value);
            for (const scope of scopes) {
                walk(
                    scope.definitions,
                    scope.values,
                    [...parentSegments, ...scope.segments],
                    out
                );
            }
        }
    }
}

/**
 * Every relationship edge held in `values`, in declaration order.
 *
 * Duplicates are collapsed: the index is keyed on
 * (source, instancePath, target), so the same id listed twice in one
 * multi-relation is one edge, not a primary-key violation.
 */
export function collectRelationshipEdges(
    definitions: Field[],
    values: Record<string, unknown>
): RelationshipEdge[] {
    const collected: RelationshipEdge[] = [];
    walk(definitions, values, [], collected);

    const seen = new Set<string>();
    return collected.filter((edge) => {
        const key = `${edge.instancePath}\u0000${edge.targetId}\u0000${edge.targetKind}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** A relationship field as DECLARED: where it sits and what it points at. */
export type RelationshipDeclaration = {
    schemaPath: string;
    targetKind: TargetKind;
    /** The declared `target`, when the field names one. */
    target: string | undefined;
};

/**
 * Every schema path at which a relationship field is DECLARED, in declaration
 * order and de-duplicated (two block types can declare the same field name).
 * Derived from definitions alone — the allow-list the `references` query
 * predicate validates a requested path against.
 */
export function collectRelationshipSchemaPaths(definitions: Field[]): string[] {
    return Array.from(
        new Set(
            collectRelationshipDeclarations(definitions).map((entry) => entry.schemaPath)
        )
    );
}

/**
 * Every declared relationship field, in declaration order. Two declarations can
 * share a schema path (two block types declaring the same field name), so this
 * is a list rather than a map.
 */
export function collectRelationshipDeclarations(
    definitions: Field[]
): RelationshipDeclaration[] {
    const collected: RelationshipDeclaration[] = [];
    walkSchema(definitions, [], collected);
    return collected;
}

/**
 * Definitions-only twin of `walk`. Container shape comes from the field type
 * rather than a list of container type names, so a plugin container recurses for
 * free. Terminates because definitions are finite and statically declared — a
 * `tree`'s recursion lives in its data, not in its schema.
 */
function walkSchema(
    definitions: Field[],
    parentSegments: readonly FieldPathSegment[],
    out: RelationshipDeclaration[]
): void {
    for (const field of flattenFieldNodes(definitions)) {
        const fieldType = getFieldType(field.type);
        const segments: FieldPathSegment[] = [
            ...parentSegments,
            { kind: 'field', name: field.name },
        ];

        if (fieldType?.isRelation === true) {
            out.push({
                schemaPath: formatSchemaPath(segments),
                targetKind: targetKindOf(field),
                target: field.target,
            });
            continue;
        }

        if (fieldType?.children !== undefined) {
            const { scopes } = fieldType.children(field, probeValue(field));
            for (const scope of scopes) {
                walkSchema(
                    scope.definitions,
                    [...parentSegments, ...scope.segments],
                    out
                );
            }
        }
    }
}

/**
 * The synthetic value that makes a container hand back its scopes: `group`
 * ignores a non-object and yields its one scope, `repeater`/`tree` yield one per
 * item, and `blocks` needs an item per declared block type or it yields none.
 * The ids `children()` mints are discarded — `formatSchemaPath` collapses an
 * item segment to `[]`.
 */
function probeValue(field: Field): unknown {
    return field.blocks !== undefined
        ? field.blocks.map((block) => ({ [RESERVED_KEY.type]: block.type }))
        : [{}];
}
