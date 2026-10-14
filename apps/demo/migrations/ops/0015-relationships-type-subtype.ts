/**
 * Ops for `0015_relationships-type-subtype`. In `relationships`, `source_type`
 * (the entry type or the global's key) becomes `source_subtype`, then
 * `source_kind` and `target_kind` become `source_type` and `target_type`. The
 * differ cannot chain renames where one column takes another's name, and the
 * index is derived from field data, so the table is recreated empty rather than
 * copied. Run `astromech index:rebuild` after this migration: nothing rebuilds
 * the index on its own.
 */

import type { MigrationOpsAuthor } from '@astromech/schema-engine/generate';

const author: MigrationOpsAuthor = ({ next }) => {
    const relationships = next.tables['relationships'];
    if (!relationships) {
        throw new Error(
            "ops/0015-relationships-type-subtype: no table 'relationships' in the next snapshot"
        );
    }
    return [
        { kind: 'dropTable', name: 'relationships' },
        { kind: 'createTable', table: relationships },
    ];
};

export default author;
