import type { BaseFieldProps } from 'astromech';
import { useTranslation } from 'react-i18next';
import { KeyValueEditor } from '../ui/key-value-editor';
import { useFieldControl } from './field-control-context';

export function KeyValueField({ name, value, onChange, disabled }: BaseFieldProps) {
    const { t } = useTranslation();
    const { labelId } = useFieldControl();
    const record =
        typeof value === 'object' && value !== null && !Array.isArray(value)
            ? (value as Record<string, string>)
            : {};

    return (
        <KeyValueEditor
            aria-labelledby={labelId}
            value={record}
            onChange={(v) => onChange(name, v)}
            addLabel={t('fields.kvAddPair')}
            keyPlaceholder={t('fields.kvKey')}
            valuePlaceholder={t('fields.kvValue')}
            {...(disabled !== undefined ? { disabled } : {})}
        />
    );
}
