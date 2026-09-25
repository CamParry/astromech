/**
 * Drops a reference to a resource that no longer exists on the next write of its
 * holder, whichever resource holds it. Operates on relation FIELD values, not
 * the derived `relationships` index (`content/relationships.ts`).
 */

import type { RelationshipDeclaration } from '@/fields/references';
import type { TargetKind } from '@/types/domain';
import type { Field } from '@/types/fields';
import type { JsonObject, ResolvedConfig } from '@/types/index';
import { resourceExistenceRepository } from '@/content/repository/resource-existence';
import { resolveEntryType } from '@/entries/entry-types';
import { parseInstancePath } from '@/fields/field-path';
import { collectRelationshipDeclarations, findReferences } from '@/fields/references';
import { RESERVED_KEY } from '@/fields/reserved-keys';
import { TARGET_KINDS } from '@/types/domain';

/**
 * Field values with dead relation ids removed, plus the drop count. `values` MUST
 * be post-`parseFields`: the traversal mints a missing item `_id`, so on raw input
 * it invents ids and addresses nothing. Never logs; the caller reports the count.
 */
export async function pruneDanglingRelations(
    config: ResolvedConfig,
    definitions: Field[],
    values: JsonObject
): Promise<{ values: JsonObject; dropped: number }> {
    const references = findReferences(definitions, values);
    if (references.length === 0) return { values, dropped: 0 };

    const prunable = prunableSchemaPaths(config, definitions);
    const candidates = references.filter((reference) =>
        prunable.has(reference.schemaPath)
    );
    if (candidates.length === 0) return { values, dropped: 0 };

    const aliveByKind = new Map<TargetKind, Set<string>>();
    for (const kind of TARGET_KINDS) {
        const ofKind = candidates.filter((reference) => reference.targetKind === kind);
        if (ofKind.length === 0) continue;
        aliveByKind.set(
            kind,
            await resourceExistenceRepository.findIds(
                kind,
                ofKind.map((reference) => reference.targetId)
            )
        );
    }

    const dead = candidates.filter(
        (reference) =>
            aliveByKind.get(reference.targetKind)?.has(reference.targetId) !== true
    );
    if (dead.length === 0) return { values, dropped: 0 };

    const next = structuredClone(values);
    for (const reference of dead) {
        dropId(next, reference.instancePath, reference.targetId);
    }
    return { values: next, dropped: dead.length };
}

/**
 * The schema paths at which a dead id may safely be dropped. A path is excluded
 * unless every declaration sharing it is prunable, because two block types can
 * declare the same field name against different targets.
 */
function prunableSchemaPaths(config: ResolvedConfig, definitions: Field[]): Set<string> {
    const verdicts = new Map<string, boolean>();
    for (const declaration of collectRelationshipDeclarations(definitions)) {
        const current = verdicts.get(declaration.schemaPath) ?? true;
        verdicts.set(declaration.schemaPath, current && isPrunable(config, declaration));
    }
    return new Set(
        Array.from(verdicts)
            .filter(([, prunable]) => prunable)
            .map(([path]) => path)
    );
}

/**
 * Whether a missing target at this declaration means the id is really dead, which
 * it does only where the declaration is checkable at all. Every `false` here is a
 * guard against deleting live author data.
 */
function isPrunable(
    config: ResolvedConfig,
    declaration: RelationshipDeclaration
): boolean {
    if (declaration.targetKind !== 'entry') return true;
    const target = declaration.target;
    if (target === undefined || target === '') return false;
    return resolveEntryType(config, target) !== undefined;
}

/**
 * Remove one id from the value at `instancePath`. A single relation becomes
 * null; a multi-relation loses just that entry and keeps the order of the rest.
 * Item ids and array order are never rewritten.
 */
function dropId(root: JsonObject, instancePath: string, targetId: string): void {
    const segments = parseInstancePath(instancePath);
    let cursor: unknown = root;

    for (const [i, segment] of segments.entries()) {
        if (segment.kind === 'item') {
            cursor = findItem(cursor, segment.id);
            if (cursor === undefined) return;
            continue;
        }
        if (!isRecord(cursor)) return;
        if (i === segments.length - 1) {
            cursor[segment.name] = withoutId(cursor[segment.name], targetId);
            return;
        }
        cursor = cursor[segment.name];
    }
}

/**
 * The item carrying `id` inside a container array. Recurses through `_children`
 * so a `tree` node at any depth is reachable — its path records the id alone,
 * never the depth.
 */
function findItem(container: unknown, id: string): Record<string, unknown> | undefined {
    if (!Array.isArray(container)) return undefined;
    for (const item of container) {
        if (!isRecord(item)) continue;
        if (item[RESERVED_KEY.id] === id) return item;
        const nested = findItem(item[RESERVED_KEY.children], id);
        if (nested !== undefined) return nested;
    }
    return undefined;
}

/** A relation value with `targetId` gone: filtered from a list, else nulled. */
function withoutId(value: unknown, targetId: string): unknown {
    if (Array.isArray(value)) return value.filter((id) => id !== targetId);
    return value === targetId ? null : value;
}

/** A plain object — the shape both a container item and a field scope have. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
