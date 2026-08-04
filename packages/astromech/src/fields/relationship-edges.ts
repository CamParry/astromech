/**
 * Relationship edge extraction — the one traversal that derives the
 * relationships index from field data.
 *
 * Field data is the single source of truth for a relation; the index is a
 * rebuildable derivative of it. This module is that derivation, and it is
 * shared by every resource that can hold a relationship field (entries, users,
 * media) so no resource can silently index nothing.
 *
 * It recurses through `descriptor.children()` — the same descriptor-driven
 * recursion the validation pipeline uses — so a relationship nested inside a
 * `group`/`repeater`/`blocks`/`tree` yields edges at any depth, and paths are
 * rendered by `field-path.ts` so they match the addresses the validation
 * pipeline and the admin renderers already agree on.
 *
 * ## Only ever run this on processed data
 *
 * `children()` mints a missing item `_id` with `crypto.randomUUID()`, so it is
 * non-deterministic on data that has never been through `processFields`. Given
 * raw input it would invent ids on every call and produce instance paths that
 * address nothing in storage. Every caller must pass the post-`processFields`
 * values that were (or are about to be) written — which is also why a rebuild
 * from stored data is safe: stored items already carry their ids.
 *
 * Pure: no db, no config, no `virtual:` import.
 */

import { formatInstancePath, formatSchemaPath } from '@/fields/field-path.js';
import { flattenFieldNodes } from '@/fields/flatten.js';
import { getFieldTypeDescriptor } from '@/fields/descriptors.js';
import { RESERVED_KEY } from '@/fields/reserved-keys.js';
import type { FieldDefinition, FieldPathSegment } from '@/types/fields.js';

/** What a relation points at. Mirrors the index's `targetKind` column. */
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
function targetKindOf(field: FieldDefinition): TargetKind {
    if (field.type === 'media') return 'media';
    return field.target === 'users' ? 'user' : 'entry';
}

/** A relation value is one id or a list of them; anything else holds no edge. */
function targetIdsOf(value: unknown): string[] {
    const raw = Array.isArray(value) ? value : [value];
    return raw.filter((id): id is string => typeof id === 'string' && id !== '');
}

function walk(
    definitions: FieldDefinition[],
    values: Record<string, unknown>,
    parentSegments: readonly FieldPathSegment[],
    out: RelationshipEdge[]
): void {
    for (const field of flattenFieldNodes(definitions)) {
        const descriptor = getFieldTypeDescriptor(field.type);
        const segments: FieldPathSegment[] = [
            ...parentSegments,
            { kind: 'field', name: field.name },
        ];
        const value = values[field.name];

        if (descriptor?.isRelation === true) {
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
        if (descriptor?.children !== undefined) {
            const { scopes } = descriptor.children(field, value);
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
    definitions: FieldDefinition[],
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
export function collectRelationshipSchemaPaths(definitions: FieldDefinition[]): string[] {
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
    definitions: FieldDefinition[]
): RelationshipDeclaration[] {
    const collected: RelationshipDeclaration[] = [];
    walkSchema(definitions, [], collected);
    return collected;
}

/**
 * Definitions-only twin of `walk`. Container shape comes from the descriptor
 * rather than a list of container type names, so a plugin container recurses for
 * free. Terminates because definitions are finite and statically declared — a
 * `tree`'s recursion lives in its data, not in its schema.
 */
function walkSchema(
    definitions: FieldDefinition[],
    parentSegments: readonly FieldPathSegment[],
    out: RelationshipDeclaration[]
): void {
    for (const field of flattenFieldNodes(definitions)) {
        const descriptor = getFieldTypeDescriptor(field.type);
        const segments: FieldPathSegment[] = [
            ...parentSegments,
            { kind: 'field', name: field.name },
        ];

        if (descriptor?.isRelation === true) {
            out.push({
                schemaPath: formatSchemaPath(segments),
                targetKind: targetKindOf(field),
                target: field.target,
            });
            continue;
        }

        if (descriptor?.children !== undefined) {
            const { scopes } = descriptor.children(field, probeValue(field));
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
function probeValue(field: FieldDefinition): unknown {
    return field.blocks !== undefined
        ? field.blocks.map((block) => ({ [RESERVED_KEY.type]: block.type }))
        : [{}];
}
