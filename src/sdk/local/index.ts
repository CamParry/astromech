/**
 * Astromech Local Client
 *
 * Direct database access for use in Astro server-side code.
 * Import from 'astromech/local'
 */

import config from 'virtual:astromech/config';
import { getDb } from '@/db/registry.js';
import { settingsTable } from '@/db/schema.js';
import type {
    AstromechClient,
    JsonValue,
    Setting,
    SettingsApi,
    TypedEntriesApi,
} from '@/types/index.js';
import { usersApi } from '@/sdk/local/users.js';
import { entries, initServerContext } from '@/sdk/local/entries.js';
import { mediaApi } from '@/sdk/local/media.js';
import { setCurrentUser } from '@/sdk/local/context.js';
import { setPluginSdkClient } from '@/plugins/runtime/plugin-runtime.js';
import { localPlugins } from '@/sdk/local/plugins.js';
import { mergeLocaleSetting } from '@/support/settings-page-values.js';
import { isPublicSettingKey } from '@/policies/visibility/settings-visibility.js';

export { initServerContext, setCurrentUser };



// ============================================================================
// Settings API Implementation
// ============================================================================

const settingsApi: SettingsApi = {
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

// ============================================================================
// Export Client
// ============================================================================

export const Astromech: AstromechClient = {
    entries: entries as unknown as TypedEntriesApi,
    media: mediaApi,
    settings: settingsApi,
    users: usersApi,
    config,
    plugins: localPlugins,
    configure(_options: { baseUrl: string }): void {
        // No-op for server SDK — direct DB access does not use a base URL
    },
};

// Register the client so plugin contexts can reach `ctx.sdk` without a static
// import cycle (plugin-runtime → sdk/local → plugin-runtime).
setPluginSdkClient(Astromech);

export default Astromech;
