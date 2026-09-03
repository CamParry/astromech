/**
 * Ops for `0003_media_content`. The differ refuses the transition: `media`
 * needs a rebuild and `media_content` references it `ON DELETE cascade`, so the
 * rebuild's `DROP TABLE` would take the rows it just created. The route below
 * rebuilds `media` first and creates the two new tables against the rebuilt
 * one; the emitted file is then hand-edited to move the data across.
 */

import type { MigrationOpsAuthor } from '@astromech/schema-engine/generate';

const author: MigrationOpsAuthor = ({ next }) => {
    const table = (name: string) => {
        const found = next.tables[name];
        if (!found)
            throw new Error(
                `ops/0003-media-content: no table '${name}' in the next snapshot`
            );
        return found;
    };
    return [
        { kind: 'dropTable', name: 'media' },
        { kind: 'createTable', table: table('media') },
        { kind: 'createTable', table: table('media_content') },
        { kind: 'createTable', table: table('media_versions') },
    ];
};

export default author;
