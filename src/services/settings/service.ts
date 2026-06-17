/**
 * Settings service — the settings capability verbs (all / get / set).
 *
 * A bare service: it talks to storage (the settings table) and applies the
 * public/private key visibility rule. Unaware of delivery shape — the Local API,
 * HTTP API, etc. project it. Visibility is per-feature, data-model-specific
 * read-shaping, so it lives beside the service it serves (./visibility.js),
 * not as a cross-cutting policy.
 */

import config from 'virtual:astromech/config';
import { getDb } from '@/db/registry.js';
import { settingsTable } from '@/db/schema.js';
import type { JsonValue, Setting, SettingsApi } from '@/types/index.js';
import { mergeLocaleSetting } from '@/utilities/settings-page-values.js';
import { isPublicSettingKey } from '@/services/settings/visibility.js';

export const settingsApi: SettingsApi = {
    async all(opts?: { full?: boolean }): Promise<Setting[]> {
        const db = getDb();
        const rows = await db.select().from(settingsTable);
        const full = opts?.full ?? false;
        const publicKeys = (config as { publicSettingKeys?: string[] }).publicSettingKeys ?? [];
        return rows
            .filter((row) => full || isPublicSettingKey(row.key, publicKeys))
            .map((row) => ({
                key: row.key,
                value: row.value ?? null,
                updatedAt: row.updatedAt,
                updatedBy: row.updatedBy ?? null,
            }));
    },

    async get(key: string, opts?: { locale?: string; full?: boolean }): Promise<JsonValue | null> {
        const db = getDb();
        const locale = opts?.locale ?? config.defaultLocale;
        const full = opts?.full ?? false;
        const publicKeys = (config as { publicSettingKeys?: string[] }).publicSettingKeys ?? [];

        // On a public read, reject private keys immediately without a DB round-trip.
        if (!full && !isPublicSettingKey(key, publicKeys)) {
            return null;
        }

        const rows = await db.select().from(settingsTable);
        const byKey: Record<string, JsonValue | null> = {};
        for (const row of rows) {
            byKey[row.key] = row.value ?? null;
        }
        const base = byKey[key] ?? null;
        if (locale) {
            const locKey = `${key}:${locale}`;
            // Public read: the per-locale key must also be public (it will be,
            // because the prefix `'<key>:'` covers all `<key>:<locale>` variants).
            const loc =
                full || isPublicSettingKey(locKey, publicKeys)
                    ? byKey[locKey]
                    : undefined;
            return mergeLocaleSetting(base, loc);
        }
        return base;
    },

    async set(key: string, value: JsonValue): Promise<Setting> {
        const db = getDb();
        const now = new Date();
        const rows = await db
            .insert(settingsTable)
            .values({ key, value, updatedAt: now })
            .onConflictDoUpdate({
                target: settingsTable.key,
                set: { value, updatedAt: now },
            })
            .returning();

        if (!rows[0]) {
            throw new Error('Failed to upsert setting');
        }

        return {
            key: rows[0].key,
            value: rows[0].value ?? null,
            updatedAt: rows[0].updatedAt,
            updatedBy: rows[0].updatedBy ?? null,
        };
    },
};
