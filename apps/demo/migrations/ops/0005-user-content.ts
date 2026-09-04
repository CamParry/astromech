/**
 * Ops for `0005_user-content`. `users` loses `fields` to the new
 * `user_content`, and on SQLite a dropped column normally means a table
 * rebuild — which the differ refuses for `users`, because every author column
 * in the schema references it and the rebuild's `DROP TABLE` would blank them.
 * This route asks for the rebuild anyway so the generator still writes the
 * snapshot, journal and index; the emitted `users` rebuild is then replaced by
 * a single `ALTER TABLE ... DROP COLUMN`, which SQLite has supported since
 * 3.35 and which leaves the referencing tables alone.
 *
 * `settings` is rebuilt as emitted: its `updated_by` foreign key gains
 * `ON DELETE set null` and nothing references `settings`.
 */

import type { MigrationOpsAuthor } from '@astromech/schema-engine/generate';

const author: MigrationOpsAuthor = ({ next }) => {
    const table = (name: string) => {
        const found = next.tables[name];
        if (!found)
            throw new Error(
                `ops/0005-user-content: no table '${name}' in the next snapshot`
            );
        return found;
    };
    const users = table('users');
    const settings = table('settings');
    return [
        { kind: 'createTable', table: table('user_content') },
        { kind: 'createTable', table: table('user_versions') },
        {
            kind: 'rebuildTable',
            table: users,
            copy: users.columns.map((column) => ({ column: column.name })),
        },
        {
            kind: 'rebuildTable',
            table: settings,
            copy: settings.columns.map((column) => ({ column: column.name })),
        },
    ];
};

export default author;
