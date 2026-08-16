/**
 * Opportunistic dangling-relation cleanup: a reference to a resource that no
 * longer exists is dropped the next time its holder is written. Shared by the
 * entry, user and media write paths; it lives in `entries/` because deciding
 * whether a target type even has rows in the `entries` table needs the entry
 * storage registry. This operates on relation FIELD values, not on the derived
 * `relationships` index (that is `internal/relationships.ts`).
 */

import config from 'virtual:astromech/config';
import { existingResourceIds } from '@/database/storage/resource-existence';
import {
    collectRelationshipDeclarations,
    collectRelationshipEdges,
} from '@/fields/relationship-edges';
import type { RelationshipDeclaration, TargetKind } from '@/fields/relationship-edges';
import { parseInstancePath } from '@/fields/field-path';
import { RESERVED_KEY } from '@/fields/reserved-keys';
import { getEntryStorage, hasEntryStorageOverride } from '../storage/registry';
import { resolveEntryType } from '../type-ids.shared';
import type { Field } from '@/types/fields';
import type { JsonObject } from '@/types/index';
import type { StorageDb } from '../storage/types';

const TARGET_KINDS = ['entry', 'user', 'media'] as const satisfies readonly TargetKind[];

/** One storage's answer to "which of these ids do you hold". */
type ExistingIds = (ids: string[]) => Promise<Set<string>>;

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

    const aliveByKind = new Map<TargetKind, Set<string>>();
    for (const kind of TARGET_KINDS) {
        const ofKind = candidates.filter((edge) => edge.targetKind === kind);
        if (ofKind.length === 0) continue;
        aliveByKind.set(
            kind,
            await existingResourceIds(
                kind,
                ofKind.map((edge) => edge.targetId),
                db
            )
        );
    }

    // Targets with a storage of their own keep no rows in `entries`, so each
    // answers for its own ids through the hook the declaration was cleared on.
    const readsByPath = storageReadsByPath(definitions);

    // A supplied `db` is the caller's transaction handle, while a registered
    // storage is bound to its own — so reading one here answers from a
    // different snapshot, where a row written earlier in this transaction looks
    // missing and its live reference gets pruned. Those targets go UNCHECKED
    // instead: a kept dangling id is dropped by the next write (decisions/0004),
    // a deleted live one is gone.
    const insideTransaction = db !== undefined;

    const readByTarget = new Map<string, ExistingIds>();
    if (!insideTransaction) {
        for (const reads of readsByPath.values()) {
            for (const [target, read] of reads) readByTarget.set(target, read);
        }
    }

    const aliveByTarget = new Map<string, Set<string>>();
    for (const [target, read] of readByTarget) {
        const ids = candidates
            .filter((edge) => readsByPath.get(edge.schemaPath)?.has(target) === true)
            .map((edge) => edge.targetId);
        if (ids.length === 0) continue;
        aliveByTarget.set(target, await read(ids));
    }

    // An id survives if ANY check that applies to its path reports it existing:
    // one schema path can declare several targets, and only all of them missing
    // it makes the reference really dead.
    const dead = candidates.filter((edge) => {
        if (aliveByKind.get(edge.targetKind)?.has(edge.targetId) === true) return false;
        for (const target of readsByPath.get(edge.schemaPath)?.keys() ?? []) {
            if (insideTransaction) return false;
            if (aliveByTarget.get(target)?.has(edge.targetId) === true) return false;
        }
        return true;
    });
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
 *   - a type with a storage of its own keeps its rows out of the `entries`
 *     table, so it is only checkable through that storage's `existingIds`.
 */
function isPrunable(declaration: RelationshipDeclaration): boolean {
    if (declaration.targetKind !== 'entry') return true;
    const target = declaration.target;
    if (target === undefined || target === '') return false;
    if (!resolveEntryType(config, target)) return false;
    if (!hasEntryStorageOverride(target)) return true;
    return getEntryStorage(target).existingIds !== undefined;
}

/** The `existingIds` read of every override-backed target, per schema path. */
function storageReadsByPath(definitions: Field[]): Map<string, Map<string, ExistingIds>> {
    const byPath = new Map<string, Map<string, ExistingIds>>();
    for (const declaration of collectRelationshipDeclarations(definitions)) {
        const target = declaration.target;
        if (declaration.targetKind !== 'entry') continue;
        if (target === undefined || target === '') continue;
        if (!hasEntryStorageOverride(target)) continue;
        const storage = getEntryStorage(target);
        if (storage.existingIds === undefined) continue;
        const reads =
            byPath.get(declaration.schemaPath) ?? new Map<string, ExistingIds>();
        reads.set(target, storage.existingIds.bind(storage));
        byPath.set(declaration.schemaPath, reads);
    }
    return byPath;
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
