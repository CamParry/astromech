/**
 * Ops for `0004_users-role`. The change is a column rename, `role_slug` to
 * `role`, and the differ has no rename op: it sees a dropped column and an
 * added one, which on SQLite means a table rebuild. It refuses a `users`
 * rebuild because seventeen tables reference `users`. This route asks for the
 * rebuild anyway so the generator still writes the snapshot, journal and
 * index; the emitted body is then replaced by a single `RENAME COLUMN`.
 */

import type { MigrationOpsAuthor } from '@astromech/schema-engine/generate';

const author: MigrationOpsAuthor = ({ next }) => {
    const table = (name: string) => {
        const found = next.tables[name];
        if (!found)
            throw new Error(
                `ops/0004-users-role: no table '${name}' in the next snapshot`
            );
        return found;
    };
    const users = table('users');
    return [
        {
            kind: 'rebuildTable',
            table: users,
            copy: users.columns.map((column) => ({ column: column.name })),
        },
    ];
};

export default author;
