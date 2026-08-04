/**
 * Opportunistic dangling-relation cleanup: a reference to a resource that no
 * longer exists is dropped the next time its holder is written. Shared by the
 * entry, user and media write paths; it lives in `entries/` because deciding
 * whether a target type even has rows in the `entries` table needs the entry
 * storage registry. This operates on relation FIELD values, not on the derived
 * `relationships` index (that is `internal/relationships.ts`).
 */

import config from 'virtual:astromech/config';
import { existingResourceIds } from '@/database/storage/resource-existence.js';
import {
    collectRelationshipDeclarations,
    collectRelationshipEdges,
} from '@/fields/relationship-edges.js';
import type {
    RelationshipDeclaration,
    RelationshipEdge,
    TargetKind,
} from '@/fields/relationship-edges.js';
import { parseInstancePath } from '@/fields/field-path.js';
import { RESERVED_KEY } from '@/fields/reserved-keys.js';
import { hasEntryStorageOverride } from '../storage/registry.js';
import { resolveEntryType } from '../type-ids.js';
import type { Field } from '@/types/fields.js';
import type { JsonObject } from '@/types/index.js';
import type { StorageDb } from '../storage/types.js';

const TARGET_KINDS = ['entry', 'user', 'media'] as const satisfies readonly TargetKind[];

/**
 * Field values with dead relation ids removed, plus what was dropped. `values`
 * MUST be post-`processFields`: the traversal mints a missing item `_id`, so on
 * raw input it invents ids and addresses nothing. Never logs — the count is the
 * caller's to report.
 */
export async function pruneDanglingRelations(
    definitions: Field[],
    values: JsonObject,
    db?: StorageDb
): Promise<{ values: JsonObject; dropped: number }> {
    const edges = collectRelationshipEdges(definitions, values);
    if (edges.length === 0) return { values, dropped: 0 };

    const prunable = prunableSchemaPaths(definitions);
    const candidates = edges.filter((edge) => prunable.has(edge.schemaPath));
    if (candidates.length === 0) return { values, dropped: 0 };

    const dead: RelationshipEdge[] = [];
    for (const kind of TARGET_KINDS) {
        const ofKind = candidates.filter((edge) => edge.targetKind === kind);
        if (ofKind.length === 0) continue;
        const alive = await existingResourceIds(
            kind,
            ofKind.map((edge) => edge.targetId),
            db
        );
        dead.push(...ofKind.filter((edge) => !alive.has(edge.targetId)));
    }
    if (dead.length === 0) return { values, dropped: 0 };

    const next = structuredClone(values);
    for (const edge of dead) dropId(next, edge.instancePath, edge.targetId);
    return { values: next, dropped: dead.length };
}

/**
 * The schema paths at which a dead id may safely be dropped. A path is excluded
 * unless every declaration sharing it is prunable, because two block types can
 * declare the same field name against different targets.
 */
function prunableSchemaPaths(definitions: Field[]): Set<string> {
    const verdicts = new Map<string, boolean>();
    for (const declaration of collectRelationshipDeclarations(definitions)) {
        const current = verdicts.get(declaration.schemaPath) ?? true;
        verdicts.set(declaration.schemaPath, current && isPrunable(declaration));
    }
    return new Set(
        Array.from(verdicts)
            .filter(([, prunable]) => prunable)
            .map(([path]) => path)
    );
}

/**
 * Whether a missing target at this declaration means the id is really dead.
 * Every `false` here is a false-negative guard, and dropping any of them would
 * delete live author data:
 *
 *   - a field naming no target gives nothing to check the id against;
 *   - a target naming no configured entry type cannot be located at all — a
 *     plugin dropped from the config takes its types with it, and its rows may
 *     be in a table this check never reads;
 *   - a `tableStorage`-backed type keeps its rows out of the `entries` table, so
 *     an existence check there reports every one of them absent.
 */
function isPrunable(declaration: RelationshipDeclaration): boolean {
    if (declaration.targetKind !== 'entry') return true;
    const target = declaration.target;
    if (target === undefined || target === '') return false;
    if (!resolveEntryType(config, target)) return false;
    return !hasEntryStorageOverride(target);
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
    if (Array.isArray(value)) return value.filter((entry) => entry !== targetId);
    return value === targetId ? null : value;
}

/** A plain object — the shape both a container item and a field scope have. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
