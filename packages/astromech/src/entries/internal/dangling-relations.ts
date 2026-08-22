/**
 * Drops a reference to a resource that no longer exists on the next write of its
 * holder. Shared by the entry, user and media write paths. Operates on relation
 * FIELD values, not the derived `relationships` index (`internal/relationships.ts`).
 */

import type { RelationshipDeclaration, TargetKind } from '@/fields/relationship-edges';
import type { Field } from '@/types/fields';
import type { JsonObject } from '@/types/index';
import { getConfig } from '@/config/registry';
import { existingResourceIds } from '@/database/repository/resource-existence';
import { getTransactionScope } from '@/database/transaction';
import { resolveEntryType } from '@/entries/entry-types.shared';
import { parseInstancePath } from '@/fields/field-path';
import {
    collectRelationshipDeclarations,
    collectRelationshipEdges,
} from '@/fields/relationship-edges';
import { RESERVED_KEY } from '@/fields/reserved-keys';
import { getEntryRepository, hasEntryRepositoryOverride } from '../repository/registry';

const TARGET_KINDS = ['entry', 'user', 'media'] as const satisfies readonly TargetKind[];

/** One repository's answer to "which of these ids do you hold". */
type ExistingIds = (ids: string[]) => Promise<Set<string>>;

/**
 * Field values with dead relation ids removed, plus the drop count. `values` MUST
 * be post-`parseFields`: the traversal mints a missing item `_id`, so on raw input
 * it invents ids and addresses nothing. Never logs; the caller reports the count.
 */
export async function pruneDanglingRelations(
    definitions: Field[],
    values: JsonObject
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
                ofKind.map((edge) => edge.targetId)
            )
        );
    }

    // Targets with a repository of their own keep no rows in `entries`, so each
    // answers for its own ids through the hook the declaration was cleared on.
    const readsByPath = repositoryReadsByPath(definitions);

    // Inside an open `transaction()` scope, a registered repository's own reads may
    // still be bound to a handle outside it — so reading one here can answer
    // from a different snapshot, where a row written earlier in this
    // transaction looks missing and its live reference gets pruned. Those
    // targets go UNCHECKED instead: a kept dangling id is dropped by the next
    // write (decisions/0004), a deleted live one is gone.
    const insideTransaction = getTransactionScope() !== undefined;

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
 * Whether a missing target at this declaration means the id is really dead, which
 * it does only where the declaration is checkable at all. Every `false` here is a
 * guard against deleting live author data.
 */
function isPrunable(declaration: RelationshipDeclaration): boolean {
    if (declaration.targetKind !== 'entry') return true;
    const target = declaration.target;
    if (target === undefined || target === '') return false;
    if (!resolveEntryType(getConfig(), target)) return false;
    if (!hasEntryRepositoryOverride(target)) return true;
    return getEntryRepository(target).existingIds !== undefined;
}

/** The `existingIds` read of every target with a repository override, per schema path. */
function repositoryReadsByPath(
    definitions: Field[]
): Map<string, Map<string, ExistingIds>> {
    const byPath = new Map<string, Map<string, ExistingIds>>();
    for (const declaration of collectRelationshipDeclarations(definitions)) {
        const target = declaration.target;
        if (declaration.targetKind !== 'entry') continue;
        if (target === undefined || target === '') continue;
        if (!hasEntryRepositoryOverride(target)) continue;
        const repository = getEntryRepository(target);
        if (repository.existingIds === undefined) continue;
        const reads =
            byPath.get(declaration.schemaPath) ?? new Map<string, ExistingIds>();
        reads.set(target, repository.existingIds.bind(repository));
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
    if (Array.isArray(value)) return value.filter((id) => id !== targetId);
    return value === targetId ? null : value;
}

/** A plain object — the shape both a container item and a field scope have. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
