/**
 * Nulls a departed user's author references across the entry tables. The
 * createdBy/updatedBy columns are `ON DELETE set null` FKs, but libSQL does not
 * enforce foreign keys at runtime, so the app clears them itself to keep user
 * deletion uniform across drivers. Called from the user delete path.
 */

import type { Db } from '@/database/types';
import { createRepository } from '@/database/repository/create-repository';
import {
    entriesTable,
    entryPreviewTokensTable,
    entryVersionsTable,
} from '@/database/tables';

export async function clearAuthorReferences(userId: string, db?: Db): Promise<void> {
    const entries = createRepository(entriesTable, db);
    await entries.updateMany({ createdBy: userId }, { createdBy: null });
    await entries.updateMany({ updatedBy: userId }, { updatedBy: null });
    await createRepository(entryVersionsTable, db).updateMany(
        { createdBy: userId },
        { createdBy: null }
    );
    await createRepository(entryPreviewTokensTable, db).updateMany(
        { createdBy: userId },
        { createdBy: null }
    );
}
