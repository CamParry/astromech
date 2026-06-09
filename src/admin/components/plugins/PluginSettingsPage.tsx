/**
 * Auto-rendered plugin settings page (spec §3.10): renders the field schema a
 * plugin declares in `admin.settings`, backed by the core settings table with
 * keys namespaced `plugin:<permissionNamespace>:<key>`. Reading requires
 * `settings:read` (enforced by the API); saving is gated on
 * `settings:update`.
 */

import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { JsonValue, PluginSettingsSchema } from '@/types/index.js';
import { Astromech } from '@/sdk/fetch/index.js';
import { usePermissions } from '@/admin/hooks/index.js';
import { queryKeys } from '@/admin/hooks/use-query-keys.js';
import { FormField } from '@/admin/components/fields/form-field.js';
import { Button, Panel, Spinner, useToast } from '@/admin/components/ui/index.js';

type PluginSettingsPageProps = {
    /** Plugin access key — used for display only. */
    plugin: string;
    /** Anchors the settings keys: `plugin:<namespace>:<field>`. */
    permissionNamespace: string;
    schema: PluginSettingsSchema;
};

export function PluginSettingsPage({
    plugin,
    permissionNamespace,
    schema,
}: PluginSettingsPageProps): React.ReactElement {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { canUpdateSettings } = usePermissions();
    const queryClient = useQueryClient();
    const readOnly = !canUpdateSettings();

    const prefix = `plugin:${permissionNamespace}:`;

    const { data: stored, isLoading } = useQuery({
        queryKey: queryKeys.settings.all(),
        queryFn: () => Astromech.settings.all(),
    });

    const [values, setValues] = React.useState<Record<string, unknown>>({});
    const [saving, setSaving] = React.useState(false);
    const [dirty, setDirty] = React.useState(false);

    React.useEffect(() => {
        if (!stored) return;
        const loaded: Record<string, unknown> = {};
        for (const setting of stored) {
            if (setting.key.startsWith(prefix)) {
                loaded[setting.key.slice(prefix.length)] = setting.value;
            }
        }
        setValues(loaded);
        setDirty(false);
    }, [stored, prefix]);

    function handleChange(name: string, value: unknown): void {
        setValues((prev) => ({ ...prev, [name]: value }));
        setDirty(true);
    }

    async function handleSave(): Promise<void> {
        setSaving(true);
        try {
            for (const field of schema.fields) {
                if (field.name in values) {
                    await Astromech.settings.set(
                        `${prefix}${field.name}`,
                        values[field.name] as JsonValue
                    );
                }
            }
            await queryClient.invalidateQueries({
                queryKey: queryKeys.settings.all(),
            });
            setDirty(false);
            toast({
                message: t('plugins.settingsSaved', { plugin }),
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

    if (isLoading) {
        return <Spinner size="md" />;
    }

    return (
        <Panel>
            <div className="am-field-list" aria-busy={saving}>
                {schema.fields.map((field) => (
                    <FormField
                        key={field.name}
                        field={field}
                        value={values[field.name]}
                        onChange={handleChange}
                        disabled={readOnly || saving}
                    />
                ))}
            </div>
            {!readOnly && (
                <div style={{ marginTop: '1rem' }}>
                    <Button
                        variant="primary"
                        onClick={() => void handleSave()}
                        loading={saving}
                        disabled={!dirty}
                    >
                        {t('common.save')}
                    </Button>
                </div>
            )}
        </Panel>
    );
}
