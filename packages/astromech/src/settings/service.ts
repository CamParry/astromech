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
import type { JsonValue, Setting, SettingsService } from '@/types/index';
import type { ResolvedConfig } from '@/types/config';
import { createSettingsStorage } from './storage';
import type { SettingRow } from './schema';
import { mergeLocaleSetting } from './page-values.shared';
import { isPublicSettingKey } from './visibility';
import { processFields } from '@/fields/pipeline';
import { flattenEntryFields } from '@/fields/flatten';
import { fieldReadsFromRecords } from '@/fields/field-reads';
import { getCurrentUser } from '@/request-context/index';
import { ValidationError } from '@/errors/validation';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

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
        const rows = await createSettingsStorage().all();
        const full = params?.full ?? false;
        const publicKeys =
            (config as { publicSettingKeys?: string[] }).publicSettingKeys ?? [];
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
        const locale = params.locale ?? config.defaultLocale;
        const full = params.full ?? false;
        const publicKeys =
            (config as { publicSettingKeys?: string[] }).publicSettingKeys ?? [];

        // On a public read, reject private keys immediately without a DB round-trip.
        if (!full && !isPublicSettingKey(key, publicKeys)) {
            return null;
        }

        const locKey = locale ? `${key}:${locale}` : null;
        const rows = await createSettingsStorage().byKeys(
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

    async set(params: { key: string; value: JsonValue }): Promise<Setting> {
        const { key } = params;
        let effectiveValue = params.value;

        const baseKey = key.includes(':') ? key.slice(0, key.indexOf(':')) : key;
        const page = (config as ResolvedConfig).adminPages.find(
            (p) => p.baseKey === baseKey
        );
        if (page?.fields && isPlainObject(effectiveValue)) {
            // Validate ONLY the fields present in this key's blob. Translatable pages
            // split global fields (baseKey) from per-locale fields (baseKey:<locale>)
            // across separate keys, so a full-field required sweep would false-fail.
            const allDefs = flattenEntryFields(page.fields);
            const presentDefs = allDefs.filter((f) =>
                Object.prototype.hasOwnProperty.call(effectiveValue, f.name)
            );
            // `ResolvedAdminPage` drops `validate` along with everything else
            // it does not project, so it has to come from the AUTHORED page.
            const resourceValidate = (config as ResolvedConfig).admin?.pages?.find(
                (p) => p.path === page.path
            )?.validate;
            const processed = await processFields(
                effectiveValue as Record<string, unknown>,
                presentDefs,
                {
                    operation: 'update',
                    host: { kind: 'setting', record: null },
                    user: getCurrentUser(),
                    reads: fieldReadsFromRecords({
                        load: async () =>
                            (await settingsService.all({ full: true })).filter(
                                (s) =>
                                    s.key === baseKey || s.key.startsWith(`${baseKey}:`)
                            ),
                        getId: (s) => s.key,
                        getFields: (s) => (isPlainObject(s.value) ? s.value : {}),
                        excludeId: key,
                    }),
                    ...(resourceValidate ? { resourceValidate } : {}),
                }
            );
            if (Object.keys(processed.errors).length > 0 || processed.form.length > 0) {
                throw ValidationError.fromFieldErrors(processed.errors, processed.form);
            }
            effectiveValue = processed.values as JsonValue;
        }

        return toSetting(await createSettingsStorage().set(key, effectiveValue));
    },
};
