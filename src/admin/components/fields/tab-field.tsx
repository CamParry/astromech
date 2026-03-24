import React, { useState } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import type { BaseFieldProps, FieldDefinition } from '@/types/index.js';
import { FieldInput } from '@/admin/components/fields/field-input';
import './tab-field.css';

export function TabField({ name, value, field, onChange }: BaseFieldProps) {
    const fields = field.fields ?? [];
    const tabLabels: string[] =
        (field.options ?? []).map((opt) => (typeof opt === 'string' ? opt : opt.label));

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

    return (
        <Tabs.Root
            className="am-tab-field"
            value={activeTab}
            onValueChange={(v) => setActiveTab(v)}
        >
            <Tabs.List className="am-tab-field__list">
                {tabLabels.map((label) => (
                    <Tabs.Tab
                        key={label}
                        value={label}
                        className={[
                            'am-tab-field__tab',
                            activeTab === label ? 'am-tab-field__tab--active' : '',
                        ]
                            .filter(Boolean)
                            .join(' ')}
                    >
                        {label}
                    </Tabs.Tab>
                ))}
            </Tabs.List>
            {tabLabels.map((label) => (
                <Tabs.Panel key={label} value={label} className="am-tab-field__panel">
                    <div className="am-tab-field__content">
                        {getTabFields(label).map((subField) => (
                            <div key={subField.name} className="am-tab-field__item">
                                <label
                                    className="am-tab-field__label"
                                    htmlFor={`${name}.${subField.name}`}
                                >
                                    {subField.label ?? subField.name}
                                    {subField.required === true && (
                                        <span className="am-tab-field__required">*</span>
                                    )}
                                </label>
                                {subField.description !== undefined && (
                                    <p className="am-tab-field__description">
                                        {subField.description}
                                    </p>
                                )}
                                <FieldInput
                                    field={subField}
                                    value={groupValue[subField.name]}
                                    name={`${name}.${subField.name}`}
                                    onChange={handleSubFieldChange}
                                />
                            </div>
                        ))}
                    </div>
                </Tabs.Panel>
            ))}
        </Tabs.Root>
    );
}
