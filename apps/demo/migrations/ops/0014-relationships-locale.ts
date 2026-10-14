/**
 * Ops for `0014_relationships-locale`. `relationships` gains a NOT NULL
 * `locale` column, which joins the primary key. The rows of the old table hold
 * no locale to copy, and the index is derived from field data, so the table is
 * recreated empty rather than backfilled. Run `astromech index:rebuild` after
 * this migration: nothing rebuilds the index on its own.
 */

import type { MigrationOpsAuthor } from '@astromech/schema-engine/generate';

const author: MigrationOpsAuthor = ({ next }) => {
    const relationships = next.tables['relationships'];
    if (!relationships) {
        throw new Error(
            "ops/0014-relationships-locale: no table 'relationships' in the next snapshot"
        );
    }
    return [
        { kind: 'dropTable', name: 'relationships' },
        { kind: 'createTable', table: relationships },
    ];
};

export default author;
