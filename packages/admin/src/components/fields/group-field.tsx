import type { BaseFieldProps } from 'astromech';
import { parseInstancePath } from 'astromech/shared';
import { useFieldControl } from './field-control-context';
import { FieldList } from './field-list';
import './group-field.css';

export function GroupField({ name, value, field, onChange, disabled }: BaseFieldProps) {
    const { labelId } = useFieldControl();
    const groupValue =
        typeof value === 'object' && value !== null && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};

    const className =
        field.boxed === false ? 'am-group-field' : 'am-group-field am-group-field--boxed';

    return (
        <div
            className={className}
            // An unboxed group has no label of its own; a `labelId` here is a parent's.
            {...(field.boxed !== false && { role: 'group', 'aria-labelledby': labelId })}
        >
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
