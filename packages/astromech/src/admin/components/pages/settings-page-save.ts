/**
 * Shared save helper for settings pages (app pages and plugin settings pages).
 *
 * Non-translatable: writes one blob at `baseKey`.
 * Translatable: partitions the values by field `translatable` flag, then
 * writes the shared (non-translatable) fields to `baseKey` and the
 * per-locale fields to `baseKey:<locale>`.
 */

import type { ResolvedEntryFields } from '@/types/fields';
import type { JsonValue } from '@/types/index';
// Deep-import the pure helper, NOT the @/settings barrel: the barrel re-exports
// the settings service (getDb / virtual:astromech/config), which must never enter
// the admin browser bundle.
import { partitionGlobalValues } from '@/settings/page-values.shared';
import { astromechClient } from '@/transport/http/client/index';

export async function saveSettingsPage(opts: {
    baseKey: string;
    fields: ResolvedEntryFields;
    values: Record<string, unknown>;
    translatable: boolean;
    locale?: string;
}): Promise<void> {
    if (!opts.translatable) {
        await astromechClient.settings.set({
            key: opts.baseKey,
            value: opts.values as JsonValue,
        });
        return;
    }
    const { shared, perLocale } = partitionGlobalValues(opts.fields, opts.values);
    await astromechClient.settings.set({ key: opts.baseKey, value: shared as JsonValue });
    await astromechClient.settings.set({
        key: `${opts.baseKey}:${opts.locale}`,
        value: perLocale as JsonValue,
    });
}
