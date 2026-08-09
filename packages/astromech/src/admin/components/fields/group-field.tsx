import type { BaseFieldProps } from '@/types/index';
import { FormField } from '@/admin/components/fields/form-field';
// Deep import: the `fields/` barrel reaches server code (virtual config / DB).
import { formatInstancePath, parseInstancePath } from '@/fields/field-path';
import './group-field.css';

export function GroupField({ name, value, field, onChange }: BaseFieldProps) {
    const fields = field.fields ?? [];
    const parentSegments = parseInstancePath(name);
    const groupValue =
        typeof value === 'object' && value !== null && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};

    function handleSubFieldChange(fieldName: string, fieldValue: unknown) {
        onChange(name, { ...groupValue, [fieldName]: fieldValue });
    }

    const className =
        field.boxed === false ? 'am-group-field' : 'am-group-field am-group-field--boxed';

    return (
        <div className={className}>
            {fields.map((subField) => (
                <FormField
                    key={subField.name}
                    field={subField}
                    value={groupValue[subField.name]}
                    name={formatInstancePath([
                        ...parentSegments,
                        { kind: 'field', name: subField.name },
                    ])}
                    // `name` is the full path (error lookup, sibling reads); the
                    // group keys its value by the BARE sub-field name, so the
                    // reported name is dropped.
                    onChange={(_path, fieldValue) =>
                        handleSubFieldChange(subField.name, fieldValue)
                    }
                />
            ))}
        </div>
    );
}
