import { useState } from 'react';
import type { BaseFieldProps, FieldDefinition } from '@/types/index.js';
import { FormField } from '@/admin/components/fields/form-field.js';
import { Tabs } from '@/admin/components/ui/tabs.js';

export function TabField({ name, value, field, onChange }: BaseFieldProps) {
    const fields = field.fields ?? [];
    const tabLabels: string[] = (field.options ?? []).map((opt) =>
        typeof opt === 'string' ? opt : opt.label
    );

    const groupValue =
        typeof value === 'object' && value !== null && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};

    const firstTab = tabLabels[0] ?? '';
    const [activeTab, setActiveTab] = useState(firstTab);

    function handleSubFieldChange(fieldName: string, fieldValue: unknown) {
        onChange(name, { ...groupValue, [fieldName]: fieldValue });
    }

    function getTabFields(tabLabel: string): FieldDefinition[] {
        return fields.filter((f) => f.tab === tabLabel);
    }

    const tabs = tabLabels.map((label) => ({ label, value: label }));

    return (
        <Tabs
            tabs={tabs}
            value={activeTab}
            onChange={setActiveTab}
            renderPanel={(tabValue) => (
                <div className="am-group-field">
                    {getTabFields(tabValue).map((subField) => (
                        <FormField
                            key={subField.name}
                            field={subField}
                            value={groupValue[subField.name]}
                            name={`${name}.${subField.name}`}
                            onChange={handleSubFieldChange}
                        />
                    ))}
                </div>
            )}
        />
    );
}
