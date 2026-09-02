/**
 * Settings service — the settings verbs (all / get / set) over the naked
 * key-value class. Talks to the repository and applies the public/private key
 * visibility rule. Unaware of delivery shape — the Local API, HTTP API, etc.
 * project it.
 */

import type { SettingRow } from './tables';
import type { JsonValue, Setting, SettingsService } from '@/types/index';
import { getConfig } from '@/config/registry';
import { createSettingsRepository } from './repository';
import { isPublicSettingKey } from './visibility';

function toSetting(row: SettingRow): Setting {
    return {
        key: row.key,
        value: row.value ?? null,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy ?? null,
    };
}

export const settingsService: SettingsService = {
    async all(params?: { full?: boolean }): Promise<Setting[]> {
        const rows = await createSettingsRepository().all();
        const full = params?.full ?? false;
        const publicKeys = getConfig().publicSettingKeys;
        return rows
            .filter((row) => full || isPublicSettingKey(row.key, publicKeys))
            .map(toSetting);
    },

    async get(params: { key: string; full?: boolean }): Promise<JsonValue | null> {
        const { key } = params;
        const full = params.full ?? false;

        // On a public read, reject private keys immediately without a DB round-trip.
        if (!full && !isPublicSettingKey(key, getConfig().publicSettingKeys)) {
            return null;
        }

        const rows = await createSettingsRepository().byKeys([key]);
        return rows[0]?.value ?? null;
    },

    /**
     * Write one key. The value is stored as given: `settings` is the naked
     * `plugin:*` key-value class, so nothing here declares fields to validate
     * against — editor-owned content with a field schema is a global.
     */
    async set(params: { key: string; value: JsonValue }): Promise<Setting> {
        return toSetting(await createSettingsRepository().set(params.key, params.value));
    },
};
