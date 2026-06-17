/**
 * Shared save helper for settings pages (app pages and plugin settings pages).
 *
 * Non-translatable: writes one blob at `baseKey`.
 * Translatable: partitions the values by field `translatable` flag, then
 * writes the shared (non-translatable) fields to `baseKey` and the
 * per-locale fields to `baseKey:<locale>`.
 */

import type { JsonValue } from '@/types/index.js';
import type { ResolvedEntryFields } from '@/types/fields.js';
import { Astromech } from '@/sdk/fetch/index.js';
import { partitionGlobalValues } from '@/support/settings-page-values.js';

export async function saveSettingsPage(opts: {
    baseKey: string;
    fields: ResolvedEntryFields;
    values: Record<string, unknown>;
    translatable: boolean;
    locale?: string;
}): Promise<void> {
    if (!opts.translatable) {
        await Astromech.settings.set(opts.baseKey, opts.values as JsonValue);
        return;
    }
    const { shared, perLocale } = partitionGlobalValues(opts.fields, opts.values);
    await Astromech.settings.set(opts.baseKey, shared as JsonValue);
    await Astromech.settings.set(`${opts.baseKey}:${opts.locale}`, perLocale as JsonValue);
}
