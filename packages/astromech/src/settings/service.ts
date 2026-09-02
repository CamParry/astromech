/**
 * Settings service — the settings verbs (all / get / set) over the naked
 * key-value class. Talks to the repository and applies the public/private key
 * visibility rule. Unaware of delivery shape — the Local API, HTTP API, etc.
 * project it.
 */

import type { SettingRow } from './tables';
import type { JsonValue, Setting, SettingsService } from '@/types/index';
import { getConfig } from '@/config/registry';
import { mergeLocaleSetting } from './page-values.shared';
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

    async get(params: {
        key: string;
        locale?: string;
        full?: boolean;
    }): Promise<JsonValue | null> {
        const { key } = params;
        const config = getConfig();
        const locale = params.locale ?? config.defaultLocale;
        const full = params.full ?? false;
        const publicKeys = config.publicSettingKeys;

        // On a public read, reject private keys immediately without a DB round-trip.
        if (!full && !isPublicSettingKey(key, publicKeys)) {
            return null;
        }

        const locKey = locale ? `${key}:${locale}` : null;
        const rows = await createSettingsRepository().byKeys(
            locKey === null ? [key] : [key, locKey]
        );
        // An absent row must stay `undefined` here, not become `null`:
        // `mergeLocaleSetting` treats both the same, but a stored `null` and a
        // withheld key are distinguishable and that distinction is free to keep.
        const byKey = new Map<string, JsonValue | null>(
            rows.map((row) => [row.key, row.value ?? null])
        );
        const base = byKey.get(key) ?? null;
        if (locKey !== null) {
            // Public read: the per-locale key must also be public (it will be,
            // because the prefix `'<key>:'` covers all `<key>:<locale>` variants).
            const loc =
                full || isPublicSettingKey(locKey, publicKeys)
                    ? byKey.get(locKey)
                    : undefined;
            return mergeLocaleSetting(base, loc);
        }
        return base;
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
