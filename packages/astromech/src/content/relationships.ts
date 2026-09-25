/**
 * Relationship indexing for a resource whose content is one row per locale, plus
 * a staged row per locale where it has staging: globals, users and media.
 * Entries share the merge rule here and read their own stored rows.
 */

import type {
    IndexedReference,
    RelationshipIndexSource,
} from '@/content/repository/relationships';
import type { StoredRows } from '@/content/repository/types';
import type { FieldReference } from '@/fields/references';
import type { Field } from '@/types/fields';
import type { JsonObject, ResolvedConfig, ResourceType } from '@/types/index';
import { relationshipRepository } from '@/content/repository/relationships';
import { flattenFieldNodes } from '@/fields/flatten';
import { findReferences } from '@/fields/references';

/** The resource: where its stored rows come from, how they join, and its fields. */
type ContentRelationshipsShape = {
    /** The resource's repository; only its stored-row read is used. */
    repository: { findStoredRows(ids?: readonly string[]): Promise<StoredRows> };
    /** The content rows' column holding the resource id: `userId`, `globalId`. */
    ownerColumn: string;
    kind: ResourceType;
    /** The field tree one resource row's content is read against. */
    fields: (config: ResolvedConfig, owner: Record<string, unknown>) => Field[];
    /** The index's `sourceType` for one resource row; absent means null. */
    sourceType?: (owner: Record<string, unknown>) => string | null;
};

/**
 * The columns the merge reads; every other column of a content row is ignored.
 * `stagedFor` is absent on a resource without staging.
 */
type ContentFields = { fields?: unknown; stagedFor?: string | null };

/**
 * The write seam and the rebuild side of one resource's relationship index,
 * both derived from the same stored content.
 */
export function createContentRelationships(shape: ContentRelationshipsShape): {
    sync: (config: ResolvedConfig, id: string) => Promise<void>;
    all: (config: ResolvedConfig) => Promise<RelationshipIndexSource[]>;
} {
    /**
     * Replace one resource's rows in the index with the references its stored
     * content now holds. The index is keyed on the resource, so every locale it
     * holds contributes: a write to one locale re-reads the rest rather than
     * replacing their references with its own. Call it inside the transaction
     * that wrote the row, after that write, so the re-read sees it.
     */
    async function sync(config: ResolvedConfig, id: string): Promise<void> {
        const [indexed] = await sources(config, [id]);
        if (!indexed) return;
        await relationshipRepository.replaceForSource(indexed.source, indexed.references);
    }

    /**
     * Every resource of this kind as a relationship source, with the references
     * its STORED content holds across all locales. The rebuild side of `sync`,
     * read as stored rows rather than through a repository `findMany()`, whose
     * join is pinned to one locale. Stored data has already been through
     * `parseFields`, so the traversal mints no ids here.
     */
    async function all(config: ResolvedConfig): Promise<RelationshipIndexSource[]> {
        return sources(config);
    }

    /** One index source per stored resource, of `ids` or of every resource. */
    async function sources(
        config: ResolvedConfig,
        ids?: readonly string[]
    ): Promise<RelationshipIndexSource[]> {
        const { owners, contents } = await shape.repository.findStoredRows(ids);

        const rowsByOwner = new Map<string, ContentFields[]>();
        for (const row of contents) {
            const ownerId = String(row[shape.ownerColumn]);
            const held = rowsByOwner.get(ownerId);
            if (held) held.push(row);
            else rowsByOwner.set(ownerId, [row]);
        }

        return owners.map((owner) =>
            indexSource(config, owner, rowsByOwner.get(String(owner['id'])) ?? [])
        );
    }

    function indexSource(
        config: ResolvedConfig,
        owner: Record<string, unknown>,
        rows: readonly ContentFields[]
    ): RelationshipIndexSource {
        const definitions = flattenFieldNodes(shape.fields(config, owner));
        return {
            // A resource with a staged row is still live, so the source is
            // never itself staged; the per-reference flag carries staging.
            source: {
                id: String(owner['id']),
                kind: shape.kind,
                type: shape.sourceType?.(owner) ?? null,
                staged: false,
            },
            references: mergeContentReferences(rows, (fields) =>
                findReferences(definitions, fields)
            ),
        };
    }

    return { sync, all };
}

/**
 * One reference per (instancePath, target) across a resource's content rows:
 * two locales holding the same reference are one row, and the index's primary
 * key would reject the second. A reference any canonical row carries is
 * canonical; one only a staged row carries is staged, so a pending merge's new
 * reference blocks a delete without appearing in a reverse lookup.
 */
export function mergeContentReferences(
    rows: readonly ContentFields[],
    referencesOf: (fields: JsonObject) => FieldReference[]
): IndexedReference[] {
    const byKey = new Map<string, IndexedReference>();
    for (const row of rows) {
        const staged = row.stagedFor !== undefined && row.stagedFor !== null;
        for (const reference of referencesOf((row.fields ?? {}) as JsonObject)) {
            const key = `${reference.instancePath}\0${reference.targetKind}\0${reference.targetId}`;
            const held = byKey.get(key);
            if (held === undefined) byKey.set(key, { ...reference, staged });
            else if (!staged) held.staged = false;
        }
    }
    return Array.from(byKey.values());
}
