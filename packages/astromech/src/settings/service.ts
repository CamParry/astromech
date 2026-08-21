/**
 * Settings service — the settings capability verbs (all / get / set). Talks
 * to the repository and applies the public/private key visibility rule.
 * Unaware of delivery shape — the Local API, HTTP API, etc. project it.
 */

import type { SettingRow } from './tables';
import type { JsonValue, Setting, SettingsService } from '@/types/index';
import { getConfig } from '@/config/registry';
import { existingEntryTypes } from '@/database/repository/resource-existence';
import { fieldLookupsFromRecords } from '@/fields/field-lookups';
import { flattenEntryFields } from '@/fields/flatten';
import { parseFields } from '@/fields/parse-fields';
import { getCurrentUser } from '@/request-context/index';
import { mergeLocaleSetting } from './page-values.shared';
import { createSettingsRepository } from './repository';
import { isPublicSettingKey } from './visibility';

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

    async set(params: { key: string; value: JsonValue }): Promise<Setting> {
        const { key } = params;
        let effectiveValue = params.value;

        const config = getConfig();
        const baseKey = key.includes(':') ? key.slice(0, key.indexOf(':')) : key;
        const page = config.adminPages.find((p) => p.baseKey === baseKey);
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
            const validate = config.admin?.pages?.find(
                (p) => p.path === page.path
            )?.validate;
            const parsed = await parseFields(
                effectiveValue as Record<string, unknown>,
                presentDefs,
                {
                    operation: 'update',
                    resource: { kind: 'setting', record: null },
                    user: await getCurrentUser(),
                    lookups: fieldLookupsFromRecords({
                        load: async () =>
                            (await settingsService.all({ full: true })).filter(
                                (s) =>
                                    s.key === baseKey || s.key.startsWith(`${baseKey}:`)
                            ),
                        getId: (s) => s.key,
                        getFields: (s) => (isPlainObject(s.value) ? s.value : {}),
                        excludeId: key,
                        entryTypes: (ids) => existingEntryTypes(ids),
                    }),
                    ...(validate ? { validate } : {}),
                }
            );
            effectiveValue = parsed as JsonValue;
        }

        return toSetting(await createSettingsRepository().set(key, effectiveValue));
    },
};
