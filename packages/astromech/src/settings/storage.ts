/**
 * Settings storage — the only place Kysely touches the `settings` table.
 *
 * Thin domain vocabulary over `createStorage(settingsTable)`, which owns encoding,
 * value serialization and row decoding. The public/private key rule is a read
 * shape, not a query, so it stays in the service.
 */

import { createStorage } from '@/database/storage/create-storage.js';
import { settingsTable } from '@/database/schema.js';
import type { Db } from '@/database/types.js';
import type { JsonValue } from '@/types/index.js';
import type { SettingRow } from './schema.js';

export type SettingsStorage = ReturnType<typeof createSettingsStorage>;

/** Defaults to the registered db; pass a tx handle to scope it to a transaction. */
export function createSettingsStorage(db?: Db) {
    const storage = createStorage(settingsTable, db);

    async function all(): Promise<SettingRow[]> {
        return storage.findMany();
    }

    /** The rows for an explicit key set — absent keys are simply not returned. */
    async function byKeys(keys: string[]): Promise<SettingRow[]> {
        return storage.findMany({ where: { key: { in: keys } } });
    }

    /**
     * Insert the key or overwrite its value. `updatedAt` is stamped by the wrapper
     * on both branches — `defaultNow` fills the insert, `onUpdate` fills the
     * conflict update — so it is deliberately absent from both value sets here.
     */
    async function set(key: string, value: JsonValue): Promise<SettingRow> {
        return storage.upsert({ key, value }, { target: ['key'], set: { value } });
    }

    return { all, byKeys, set };
}
