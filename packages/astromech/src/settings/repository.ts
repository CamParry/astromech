/**
 * Settings repository — the only place Kysely touches the `settings` table.
 * The public/private key rule is a read shape, not a query, so it stays in
 * the service.
 */

import type { SettingRow } from './tables';
import type { Db } from '@/database/types';
import type { JsonValue } from '@/types/index';
import { createRepository } from '@/database/repository/create-repository';
import { settingsTable } from '@/database/tables';

export type SettingsRepository = ReturnType<typeof createSettingsRepository>;

/** Defaults to the registered db; pass a tx handle to scope it to a transaction. */
export function createSettingsRepository(db?: Db) {
    const repository = createRepository(settingsTable, db);

    async function all(): Promise<SettingRow[]> {
        return repository.findMany();
    }

    /** The rows for an explicit key set — absent keys are simply not returned. */
    async function byKeys(keys: string[]): Promise<SettingRow[]> {
        return repository.findMany({ where: { key: { in: keys } } });
    }

    /**
     * Insert the key or overwrite its value. `updatedAt` is stamped by the wrapper
     * on both branches — `defaultNow` fills the insert, `onUpdate` fills the
     * conflict update — so it is deliberately absent from both value sets here.
     */
    async function set(key: string, value: JsonValue): Promise<SettingRow> {
        return repository.upsert({ key, value }, { target: ['key'], set: { value } });
    }

    return { all, byKeys, set };
}
