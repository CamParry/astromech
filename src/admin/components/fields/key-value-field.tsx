import { useTranslation } from 'react-i18next';
import type { BaseFieldProps } from '@/types/index.js';
import { KeyValueEditor } from '@/admin/components/ui/key-value-editor.js';

export function KeyValueField({ name, value, onChange }: BaseFieldProps) {
    const { t } = useTranslation();
    const record = typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, string>)
        : {};

    return (
        <KeyValueEditor
            value={record}
            onChange={(v) => onChange(name, v)}
            addLabel={t('fields.kvAddPair')}
            keyPlaceholder={t('fields.kvKey')}
            valuePlaceholder={t('fields.kvValue')}
        />
    );
}
