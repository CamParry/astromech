/**
 * Nulls a departed user's author references across the schema. The
 * `createdBy`/`updatedBy` columns are `ON DELETE set null` FKs, but libSQL does
 * not enforce foreign keys at runtime, so the app clears them itself to keep
 * user deletion uniform across drivers. Called from the user delete path, inside
 * its transaction — the scope is ambient, so no `db` is passed.
 *
 * The columns are read off the table descriptors rather than listed here, so a
 * core table that grows an author column is covered without an edit. Plugin
 * tables are NOT walked: their descriptors reach the runtime only through
 * `config.plugins`, which `ResolvedConfig` strips, so a service cannot enumerate
 * them without being handed the config.
 */

import type { Column } from '@/database/define-table';
import { createRepository } from '@/database/repository/create-repository';
import { CORE_TABLES, usersTable } from '@/database/tables';

/**
 * True for an author column: an FK to the users table declaring `set null`. The
 * owning FKs (`user_content.userId`, `notifications.userId`) declare `cascade`
 * and are the row's own key, so they are not cleared — the delete takes them.
 */
function isAuthorColumn(column: Column): boolean {
    if (column.reference?.onDelete !== 'set null') return false;
    const target = column.reference.target();
    return target === 'users' || target === usersTable;
}

export async function clearAuthorReferences(userId: string): Promise<void> {
    for (const table of CORE_TABLES) {
        // A user's own row is what the delete removes; nulling its columns first
        // would be pointless work.
        if (table === usersTable) continue;
        const repository = createRepository(table);
        for (const [name, column] of Object.entries(table.columns)) {
            if (!isAuthorColumn(column)) continue;
            await repository.updateMany({ [name]: userId }, { [name]: null });
        }
    }
}
