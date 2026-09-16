/**
 * Relationship indexing for a resource whose content is one row per locale and
 * nothing else: users and media. Entries keep their own policy, where staging
 * and custom tables change the rule.
 */

import type { Table } from '@/database/define-table';
import type { RelationshipIndexSource } from '@/database/repository/relationships';
import type { FieldReference, TargetKind } from '@/fields/references';
import type { Field } from '@/types/fields';
import type { JsonObject, ResolvedConfig } from '@/types/index';
import { createRepository } from '@/database/repository/create-repository';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { flattenFieldNodes } from '@/fields/flatten';
import { findReferences } from '@/fields/references';

/** The resource: its two tables, the column joining them, and its fields. */
type ContentRelationshipsShape = {
    table: Table;
    contentTable: Table;
    ownerColumn: string;
    kind: TargetKind;
    fields: (config: ResolvedConfig) => Field[];
};

/** The columns this policy reads; every other column of a content row is ignored. */
type ContentFields = { fields?: unknown };

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
        const rows = await createRepository(shape.contentTable).findMany({
            where: { [shape.ownerColumn]: id },
        });
        await createRelationshipRepository().replaceForSource(
            { id, kind: shape.kind },
            contentReferences(config, rows)
        );
    }

    /**
     * Every resource of this kind as a relationship source, with the references
     * its STORED content holds across all locales. The rebuild side of `sync`,
     * read straight from the tables rather than through `repository.list()`,
     * whose join is pinned to the default locale. Stored data has already been
     * through `parseFields`, so the traversal mints no ids here.
     */
    async function all(config: ResolvedConfig): Promise<RelationshipIndexSource[]> {
        const owners = await createRepository(shape.table).findMany({});
        const contents = await createRepository(shape.contentTable).findMany({});

        const rowsByOwner = new Map<string, ContentFields[]>();
        for (const row of contents) {
            const ownerId = String(row[shape.ownerColumn]);
            const held = rowsByOwner.get(ownerId);
            if (held) held.push(row);
            else rowsByOwner.set(ownerId, [row]);
        }

        return owners.map((owner) => {
            const id = String(owner['id']);
            return {
                source: { id, kind: shape.kind },
                references: contentReferences(config, rowsByOwner.get(id) ?? []),
            };
        });
    }

    /**
     * One reference per (instancePath, target) across a resource's content rows:
     * two locales holding the same reference are one row, and the index's
     * primary key would reject the second. Neither resource has staging, so
     * every reference is canonical.
     */
    function contentReferences(
        config: ResolvedConfig,
        rows: readonly ContentFields[]
    ): FieldReference[] {
        const definitions = flattenFieldNodes(shape.fields(config));
        const byKey = new Map<string, FieldReference>();
        for (const row of rows) {
            const fields = (row.fields ?? {}) as JsonObject;
            for (const reference of findReferences(definitions, fields)) {
                const key = `${reference.instancePath}\0${reference.targetKind}\0${reference.targetId}`;
                byKey.set(key, reference);
            }
        }
        return Array.from(byKey.values());
    }

    return { sync, all };
}
