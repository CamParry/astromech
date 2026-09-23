/**
 * Reference extraction — derives the relationships index from field data via
 * `fieldType.children()`, and the declared relation paths via `traverseFields`.
 * Run it only on parsed data: `children()` mints ids on raw input.
 */

import type { TargetKind } from '@/types/domain';
import type { DataField, Field, FieldPathSegment } from '@/types/fields';
import { formatInstancePath, formatSchemaPath } from '@/fields/field-path';
import { getFieldType } from '@/fields/field-type-registry';
import { fieldAffectsData, flattenFieldNodes } from '@/fields/flatten';
import { traverseFields } from '@/fields/traverse';

/** One id a relation field holds, and where in the field data it sits. */
export type FieldReference = {
    /** `sections[].gallery` — what a query matches on. */
    schemaPath: string;
    /** `sections[a1].gallery` — for deep-linking; never pattern-matched. */
    instancePath: string;
    targetId: string;
    targetKind: TargetKind;
};

/**
 * What a relation field points at. `media` fields are relations too, so a media
 * field writes a relationship row like any other.
 */
function targetKindOf(field: DataField): TargetKind {
    if (field.type === 'media') return 'media';
    return field.target === 'users' ? 'user' : 'entry';
}

/** A relation value is one id or a list of them; anything else holds no reference. */
function targetIdsOf(value: unknown): string[] {
    const raw = Array.isArray(value) ? value : [value];
    return raw.filter((id): id is string => typeof id === 'string' && id !== '');
}

function walk(
    definitions: Field[],
    values: Record<string, unknown>,
    parentSegments: readonly FieldPathSegment[],
    out: FieldReference[]
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
 * Every reference held in `values`, in declaration order.
 *
 * Duplicates are collapsed: the index is keyed on
 * (source, instancePath, target), so the same id listed twice in one
 * multi-relation is one reference, not a primary-key violation.
 */
export function findReferences(
    definitions: Field[],
    values: Record<string, unknown>
): FieldReference[] {
    const collected: FieldReference[] = [];
    walk(definitions, values, [], collected);

    const seen = new Set<string>();
    return collected.filter((reference) => {
        const key = `${reference.instancePath}\u0000${reference.targetId}\u0000${reference.targetKind}`;
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
    traverseFields(definitions, ({ field, schemaPath }) => {
        if (!fieldAffectsData(field)) return;
        if (getFieldType(field.type)?.isRelation !== true) return;
        collected.push({
            schemaPath,
            targetKind: targetKindOf(field),
            target: field.target,
        });
        return false;
    });
    return collected;
}
