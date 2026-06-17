/**
 * Shared settings-page form renderer, used by both host pages (`/page/*`) and
 * plugin settings pages (`/plugin/*`). Owns: query-load + synchronous seed,
 * dirty tracking, Page/PageHeader shell with header save button + unsaved-
 * changes indicator + locale switcher, save via saveSettingsPage.
 *
 * Parameterized by pre-resolved `baseKey` and `fields` so the caller is
 * origin-agnostic (host pages pass `baseKey = path`; plugin pages pass
 * `baseKey = 'plugin:<ns>:<path>'`).
 */

import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import type { Label, ResolvedEntryFields } from '@/types/index.js';
import { Astromech } from '@/client/index.js';
import { saveSettingsPage } from '@/admin/lib/settings-page-save.js';
import { FieldTreeForm } from '@/admin/components/fields/FieldTreeForm.js';
import {
    Button,
    Page,
    PageContent,
    PageHeader,
    PageTitle,
    Select,
    Spinner,
    useToast,
} from '@/admin/components/ui/index.js';
import { resolveLabel } from '@/admin/i18n/labels.js';
import { resolveContentLocale } from '@/utilities/locale.js';

// ============================================================================
// Query key
// ============================================================================

function settingsPageKey(baseKey: string, locale: string | undefined) {
    return ['settings-page', baseKey, locale ?? '__shared__'] as const;
}

// ============================================================================
// Props
// ============================================================================

export type SettingsPageFormProps = {
    baseKey: string;
    fields: ResolvedEntryFields;
    label: Label;
    translatable: boolean;
    readOnly: boolean;
};

// ============================================================================
// Component
// ============================================================================

export function SettingsPageForm({
    baseKey,
    fields,
    label,
    translatable,
    readOnly,
}: SettingsPageFormProps): React.ReactElement {
    const { t } = useTranslation();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // `defaultLocale` may be a display tag (e.g. `en-GB`) with no exact content
    // locale; resolve it to a real one so the selector and fetch use a key that
    // actually exists (mirrors the entry edit page).
    const [locale, setLocale] = React.useState<string>(
        () =>
            resolveContentLocale(adminConfig.defaultLocale, adminConfig.locales) ??
            adminConfig.locales[0] ??
            adminConfig.defaultLocale
    );
    const effectiveLocale = translatable ? locale : undefined;

    const pageLabel = resolveLabel(label, baseKey, t, 'translation');

    const { data: loadedValues, isLoading } = useQuery({
        queryKey: settingsPageKey(baseKey, effectiveLocale),
        queryFn: async () => {
            const val = await Astromech.settings.get(
                baseKey,
                effectiveLocale ? { locale: effectiveLocale } : undefined
            );
            if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
                return val as Record<string, unknown>;
            }
            return {} as Record<string, unknown>;
        },
    });

    const [values, setValues] = React.useState<Record<string, unknown>>({});
    const [saving, setSaving] = React.useState(false);
    const [dirty, setDirty] = React.useState(false);
    const [seededKey, setSeededKey] = React.useState<string | null>(null);

    // Identity of the data currently loaded (baseKey + locale).
    const dataKey = `${baseKey}::${effectiveLocale ?? '__shared__'}`;

    // Seed the editable copy synchronously the moment the loaded data for this
    // (baseKey, locale) arrives — during render, before paint — so fields that
    // snapshot their initial value at mount (e.g. repeaters) start from the
    // real data rather than an empty form. Paired with the `key` on the form
    // below, switching locale fully re-initialises the tree.
    if (loadedValues !== undefined && seededKey !== dataKey) {
        setValues(loadedValues);
        setDirty(false);
        setSeededKey(dataKey);
    }

    function handleChange(name: string, value: unknown): void {
        setValues((prev) => ({ ...prev, [name]: value }));
        setDirty(true);
    }

    async function handleSave(): Promise<void> {
        setSaving(true);
        try {
            await saveSettingsPage({
                baseKey,
                fields,
                values,
                translatable,
                locale,
            });

            await queryClient.invalidateQueries({
                queryKey: settingsPageKey(baseKey, effectiveLocale),
            });
            setDirty(false);
            toast({
                message: t('pages.saved', { label: pageLabel }),
                variant: 'success',
            });
        } catch (error) {
            toast({
                message: error instanceof Error ? error.message : t('common.error'),
                variant: 'error',
            });
        } finally {
            setSaving(false);
        }
    }

    const localeOptions = adminConfig.locales.map((loc) => ({
        value: loc,
        label: loc.toUpperCase(),
    }));

    return (
        <Page>
            <PageHeader>
                <PageTitle>{pageLabel}</PageTitle>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {!readOnly && dirty && (
                        <span className="am-form-layout-dirty-indicator">
                            {t('common.unsavedChanges')}
                        </span>
                    )}
                    {!readOnly && (
                        <Button
                            variant="primary"
                            onClick={() => void handleSave()}
                            loading={saving}
                            disabled={!dirty}
                        >
                            {t('common.save')}
                        </Button>
                    )}
                    {translatable && adminConfig.locales.length > 0 && (
                        <Select
                            value={locale}
                            onValueChange={(v) => {
                                if (v) setLocale(v);
                            }}
                            options={localeOptions}
                        />
                    )}
                </div>
            </PageHeader>
            <PageContent>
                {isLoading ? (
                    <Spinner size="md" />
                ) : (
                    <div aria-busy={saving}>
                        <FieldTreeForm
                            key={dataKey}
                            fields={fields}
                            values={values}
                            onChange={handleChange}
                            disabled={readOnly || saving}
                        />
                    </div>
                )}
            </PageContent>
        </Page>
    );
}
