/**
 * Relationship indexing for a resource whose content is one row per locale, plus
 * a staged row per locale where it has staging: entries, globals, users and
 * media.
 */

import type {
    IndexedReference,
    RelationshipIndexSource,
} from '@/content/repository/relationships';
import type { StoredRows } from '@/content/repository/types';
import type { FieldReference } from '@/fields/references';
import type { JsonObject, ResolvedConfig, ResourceType } from '@/types/index';
import { relationshipRepository } from '@/content/repository/relationships';
import { flattenFieldNodes } from '@/fields/flatten';
import { findReferences } from '@/fields/references';
import { RESOURCE_CONFIG } from './resources';

/** The resource: where its stored rows come from and how they join. */
type ContentRelationshipsShape = {
    /** The resource's repository; only its stored-row read is used. */
    repository: { findStoredRows(ids?: readonly string[]): Promise<StoredRows> };
    /** The content rows' column holding the resource id: `entryId`, `userId`. */
    resourceIdColumn: string;
    type: ResourceType;
    /**
     * The index's `sourceSubtype` for one resource row, and the target its fields
     * are read for (an entry's type, a global's key); absent means null.
     */
    sourceSubtype?: (resourceRow: Record<string, unknown>) => string | null;
};

/**
 * The columns the merge reads; every other column of a content row is ignored.
 * `stagedFor` is absent on a resource without staging.
 */
type ContentFields = {
    locale: string;
    fields?: unknown;
    stagedFor?: string | null | undefined;
};

/**
 * The write seam and the rebuild side of one resource's relationship index,
 * both derived from the same stored content.
 */
export function createContentRelationships(shape: ContentRelationshipsShape): {
    sync: (config: ResolvedConfig, id: string) => Promise<void>;
    all: (
        config: ResolvedConfig,
        options?: { subtype?: string }
    ) => Promise<RelationshipIndexSource[]>;
} {
    /**
     * Replace one resource's rows in the index with the references its stored
     * content now holds, in every locale. The replace covers the whole resource,
     * so a write to one locale re-reads the rest rather than dropping their rows.
     * Call it inside the transaction that wrote the row, after that write and
     * after its shared fields reach the other locales, so the re-read sees both.
     */
    async function sync(config: ResolvedConfig, id: string): Promise<void> {
        const [indexed] = await sources(config, [id]);
        if (!indexed) return;
        await relationshipRepository.replaceForSource(indexed.source, indexed.references);
    }

    /**
     * Every resource of this type as a relationship source, with the references
     * its STORED content holds in each locale. The rebuild side of `sync`,
     * read as stored rows rather than through a repository `findMany()`, whose
     * join is pinned to one locale. Stored data has already been through
     * `parseFields`, so the traversal mints no ids here. `subtype` keeps only the
     * resources whose `sourceSubtype` it is.
     */
    async function all(
        config: ResolvedConfig,
        options?: { subtype?: string }
    ): Promise<RelationshipIndexSource[]> {
        return sources(config, undefined, options?.subtype);
    }

    /**
     * One index source per stored resource, of `ids` or of every resource, and
     * of `subtype` when given.
     */
    async function sources(
        config: ResolvedConfig,
        ids?: readonly string[],
        subtype?: string
    ): Promise<RelationshipIndexSource[]> {
        const { resourceRows, contents } = await shape.repository.findStoredRows(ids);

        const contentRowsById = new Map<string, ContentFields[]>();
        for (const row of contents) {
            const resourceId = String(row[shape.resourceIdColumn]);
            const fields: ContentFields = {
                locale: String(row['locale']),
                fields: row['fields'],
                stagedFor: row['stagedFor'] as string | null | undefined,
            };
            const held = contentRowsById.get(resourceId);
            if (held) held.push(fields);
            else contentRowsById.set(resourceId, [fields]);
        }

        const kept =
            subtype === undefined
                ? resourceRows
                : resourceRows.filter(
                      (resourceRow) => sourceSubtypeOf(resourceRow) === subtype
                  );
        return kept.map((resourceRow) =>
            indexSource(
                config,
                resourceRow,
                contentRowsById.get(String(resourceRow['id'])) ?? []
            )
        );
    }

    function indexSource(
        config: ResolvedConfig,
        resourceRow: Record<string, unknown>,
        rows: readonly ContentFields[]
    ): RelationshipIndexSource {
        const sourceSubtype = sourceSubtypeOf(resourceRow);
        // A target no longer declared has no fields, so it holds no references.
        const definitions = flattenFieldNodes(
            RESOURCE_CONFIG[shape.type].fields(config, sourceSubtype ?? undefined)
        );
        return {
            // A resource with a staged row is still live, so the source is
            // never itself staged; the per-reference flag carries staging.
            source: {
                id: String(resourceRow['id']),
                type: shape.type,
                subtype: sourceSubtype,
                staged: false,
            },
            references: mergeContentReferences(rows, (fields) =>
                findReferences(definitions, fields)
            ),
        };
    }

    function sourceSubtypeOf(resourceRow: Record<string, unknown>): string | null {
        return shape.sourceSubtype?.(resourceRow) ?? null;
    }

    return { sync, all };
}

/**
 * One reference per (locale, instancePath, target) across a resource's content
 * rows. A locale's canonical and staged rows share the locale, and the index's
 * primary key would reject the second copy. Within a locale, a reference the
 * canonical row carries is canonical; one only the staged row carries is
 * staged, so a pending merge's new reference blocks a delete without appearing
 * in a reverse lookup.
 */
export function mergeContentReferences(
    rows: readonly ContentFields[],
    referencesOf: (fields: JsonObject) => FieldReference[]
): IndexedReference[] {
    const byKey = new Map<string, IndexedReference>();
    for (const row of rows) {
        const staged = row.stagedFor !== undefined && row.stagedFor !== null;
        for (const reference of referencesOf((row.fields ?? {}) as JsonObject)) {
            const key = [
                row.locale,
                reference.instancePath,
                reference.targetType,
                reference.targetId,
            ].join('\0');
            const held = byKey.get(key);
            if (held === undefined) {
                byKey.set(key, { ...reference, locale: row.locale, staged });
            } else if (!staged) held.staged = false;
        }
    }
    return Array.from(byKey.values());
}
