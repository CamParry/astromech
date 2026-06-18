import type { BaseFieldProps } from '@/types/index.js';
import { FormField } from '@/admin/components/fields/form-field';
import './group-field.css';

export function GroupField({ name, value, field, onChange }: BaseFieldProps) {
    const fields = field.fields ?? [];
    const groupValue =
        typeof value === 'object' && value !== null && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};

    function handleSubFieldChange(fieldName: string, fieldValue: unknown) {
        onChange(name, { ...groupValue, [fieldName]: fieldValue });
    }

    const className =
        field.container === false
            ? 'am-group-field'
            : 'am-group-field am-group-field--boxed';

    return (
        <div className={className}>
            {fields.map((subField) => (
                <FormField
                    key={subField.name}
                    field={subField}
                    value={groupValue[subField.name]}
                    name={`${name}.${subField.name}`}
                    onChange={handleSubFieldChange}
                />
            ))}
        </div>
    );
}
