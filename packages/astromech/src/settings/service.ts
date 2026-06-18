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
import { getDb } from '@/database/registry.js';
import { settingsTable } from './schema.js';
import type { JsonValue, Setting, SettingsApi } from '@/types/index.js';
import type { ResolvedConfig } from '@/types/config.js';
import { mergeLocaleSetting } from './page-values.js';
import { isPublicSettingKey } from './visibility.js';
import { processFields } from '@/fields/pipeline.js';
import { flattenEntryFields } from '@/fields/helpers.js';
import { scopedReadsFromRecords } from '@/fields/scoped-reads.js';
import { getCurrentUser } from '@/context/index.js';
import { ValidationError } from '@/errors/validation.js';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

export const settingsApi: SettingsApi = {
    async all(opts?: { full?: boolean }): Promise<Setting[]> {
        const db = getDb();
        const rows = await db.select().from(settingsTable);
        const full = opts?.full ?? false;
        const publicKeys =
            (config as { publicSettingKeys?: string[] }).publicSettingKeys ?? [];
        return rows
            .filter((row) => full || isPublicSettingKey(row.key, publicKeys))
            .map((row) => ({
                key: row.key,
                value: row.value ?? null,
                updatedAt: row.updatedAt,
                updatedBy: row.updatedBy ?? null,
            }));
    },

    async get(
        key: string,
        opts?: { locale?: string; full?: boolean }
    ): Promise<JsonValue | null> {
        const db = getDb();
        const locale = opts?.locale ?? config.defaultLocale;
        const full = opts?.full ?? false;
        const publicKeys =
            (config as { publicSettingKeys?: string[] }).publicSettingKeys ?? [];

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
        let effectiveValue = value;

        const baseKey = key.includes(':') ? key.slice(0, key.indexOf(':')) : key;
        const page = (config as ResolvedConfig).adminPages.find((p) => p.baseKey === baseKey);
        if (page?.fields && isPlainObject(effectiveValue)) {
            // Validate ONLY the fields present in this key's blob. Translatable pages
            // split global fields (baseKey) from per-locale fields (baseKey:<locale>)
            // across separate keys, so a full-field required sweep would false-fail.
            const allDefs = flattenEntryFields(page.fields);
            const presentDefs = allDefs.filter((f) =>
                Object.prototype.hasOwnProperty.call(effectiveValue, f.name)
            );
            const processed = await processFields(
                effectiveValue as Record<string, unknown>,
                presentDefs,
                {
                    operation: 'update',
                    host: { kind: 'setting', record: null },
                    user: getCurrentUser(),
                    reads: scopedReadsFromRecords({
                        load: async () =>
                            (await settingsApi.all({ full: true })).filter(
                                (s) => s.key === baseKey || s.key.startsWith(`${baseKey}:`)
                            ),
                        getId: (s) => s.key,
                        getFields: (s) => (isPlainObject(s.value) ? s.value : {}),
                        excludeId: key,
                    }),
                }
            );
            if (Object.keys(processed.errors).length > 0) {
                throw ValidationError.fromFieldErrors(processed.errors);
            }
            effectiveValue = processed.values as JsonValue;
        }

        const db = getDb();
        const now = new Date();
        const rows = await db
            .insert(settingsTable)
            .values({ key, value: effectiveValue, updatedAt: now })
            .onConflictDoUpdate({
                target: settingsTable.key,
                set: { value: effectiveValue, updatedAt: now },
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
