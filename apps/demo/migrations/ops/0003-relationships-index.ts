/**
 * Hand-authored ops for `0003_relationships-index`.
 *
 * A RECORD of how that migration was produced, not a script to re-run — running
 * it again would append another migration doing the same thing.
 *
 * Why the differ refused: `relationships` gains four NOT NULL columns
 * (`source_kind`, `schema_path`, `instance_path`, `target_kind`) with no
 * SQL-literal default. The rebuild path backfills by copying same-named columns,
 * and none of these has a source in the old shape — `name` cannot become a
 * field path, and the old `target_type` was written wrong often enough that
 * translating it would launder a bug into the new table.
 *
 * Why DROP + CREATE is safe HERE: the table is a DERIVED INDEX over field data,
 * which is the single source of truth for every relation. Nothing is lost that
 * `index:rebuild` cannot recompute, and the old rows were known-incomplete
 * (nested relationships were never indexed at all, and no media row was ever
 * written). A migration that drops data has to be able to say why the loss is
 * acceptable — here the data was never authoritative to begin with.
 *
 * `entry_versions` is the ordinary half: it only drops `relations`, which the
 * differ would have rebuilt on its own. It is restated here because `--ops`
 * replaces the whole plan rather than adding to it.
 *
 *     npm run db:generate -- --ops migrations/ops/0003-relationships-index.ts \
 *         --name relationships-index
 */

import type { MigrationOpsAuthor } from '@astromech/schema-engine/generate';

const author: MigrationOpsAuthor = ({ next }) => {
    const relationships = next.tables.relationships;
    const entryVersions = next.tables.entry_versions;
    if (!relationships || !entryVersions) {
        throw new Error('relationships / entry_versions absent from the snapshot');
    }
    // Built from `next`, never from a literal, so the SQL that lands is the
    // same SQL the renderers emit everywhere else.
    return [
        { kind: 'dropTable', name: relationships.name },
        { kind: 'createTable', table: relationships },
        {
            kind: 'rebuildTable',
            table: entryVersions,
            // Every surviving column exists in the old shape, so each copies
            // straight across; only `relations` is left behind.
            copy: entryVersions.columns.map((col) => ({ column: col.name })),
        },
    ];
};

export default author;
