import type { BaseFieldProps } from 'astromech';
import { parseInstancePath } from 'astromech/shared';
import { FieldList } from '../entries/entry-fields-renderer';
import './group-field.css';

export function GroupField({ name, value, field, onChange, disabled }: BaseFieldProps) {
    const groupValue =
        typeof value === 'object' && value !== null && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};

    const className =
        field.boxed === false ? 'am-group-field' : 'am-group-field am-group-field--boxed';

    return (
        <div className={className}>
            <FieldList
                nodes={field.fields ?? []}
                scope={{
                    values: groupValue,
                    onChange: (fieldName, fieldValue) =>
                        onChange(name, { ...groupValue, [fieldName]: fieldValue }),
                    segments: parseInstancePath(name),
                }}
                disabled={disabled}
            />
        </div>
    );
}
