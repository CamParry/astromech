/**
 * Record helpers: narrow a storage record to the public `Entry`, and load an
 * entry through storage while asserting its type (the type-mismatch guard the
 * service applies before every by-id operation).
 */

import { EntryTypeMismatchError } from '../errors.js';
import type { EntryRecord, EntryStorage } from '../storage/types.js';
import type { Entry } from '@/types/index.js';

/**
 * Narrow a storage `EntryRecord` to the public `Entry`. The built-in storage —
 * the only Phase 2 implementation — always returns full, locale-enriched
 * Entries. The contract is intentionally wider (`EntryRecord`) so Phase 3
 * single-table storages need not carry every capability column.
 */
export function asEntry(record: EntryRecord): Entry {
    return record as Entry;
}

/**
 * Load an entry through storage (including trashed rows) and assert its type.
 * Throws not-found / type-mismatch the same way the original direct-row helper
 * did. Returns the storage record (locale-enriched Entry for built-in storage).
 */
export async function loadAndAssertType(
    storage: EntryStorage,
    type: string,
    id: string
): Promise<Entry> {
    const record = await storage.get(id, { includeTrashed: true });
    if (!record) throw new Error(`Entry '${id}' not found`);
    if (record.type !== undefined && record.type !== type) {
        throw new EntryTypeMismatchError({
            entryId: id,
            expectedType: type,
            actualType: record.type,
        });
    }
    return record as Entry;
}
