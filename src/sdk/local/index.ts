/**
 * Astromech Local Client
 *
 * Direct database access for use in Astro server-side code.
 * Import from 'astromech/local'
 */

import config from 'virtual:astromech/config';
import { eq } from 'drizzle-orm';
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

export { initServerContext, setCurrentUser };



// ============================================================================
// Settings API Implementation
// ============================================================================

const settingsApi: SettingsApi = {
    async all(): Promise<Setting[]> {
        const db = getDb();
        const rows = await db.select().from(settingsTable);
        return rows.map((row) => ({
            key: row.key,
            value: row.value ?? null,
            updatedAt: row.updatedAt,
            updatedBy: row.updatedBy ?? null,
        }));
    },

    async get(key: string): Promise<JsonValue | null> {
        const db = getDb();
        const rows = await db
            .select()
            .from(settingsTable)
            .where(eq(settingsTable.key, key))
            .limit(1);
        if (!rows[0]) return null;
        return rows[0].value ?? null;
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
    configure(_options: { baseUrl: string }): void {
        // No-op for server SDK — direct DB access does not use a base URL
    },
};

export default Astromech;
