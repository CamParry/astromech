/**
 * Field-group rendering shared by the entry create/edit pages.
 *
 * `FieldGroupPanel` renders one group as a panel of form fields.
 * `FieldGroupTabs` renders all `placement: 'tab'` groups behind a tab strip —
 * the strip only exists when at least one group declares it.
 */

import React from 'react';
import type { FieldGroup } from '@/types/index.js';
import { Panel, Tabs } from '@/admin/components/ui/index.js';
import { FormField } from '@/admin/components/fields/form-field.js';

type FieldGroupPanelProps = {
    group: FieldGroup;
    values: Record<string, unknown>;
    onChange: (name: string, value: unknown) => void;
    disabled?: boolean;
    /** Drop the panel title when the surrounding chrome (e.g. a tab) already shows it. */
    hideTitle?: boolean;
};

export function FieldGroupPanel({
    group,
    values,
    onChange,
    disabled,
    hideTitle,
}: FieldGroupPanelProps): React.ReactElement {
    return (
        <Panel
            {...(hideTitle !== true && { title: group.label })}
            {...(group.description !== undefined && { description: group.description })}
        >
            <div className="am-field-list">
                {group.fields.map((field) => (
                    <FormField
                        key={field.name}
                        field={field}
                        value={values[field.name]}
                        onChange={onChange}
                        disabled={disabled ?? false}
                    />
                ))}
            </div>
        </Panel>
    );
}

type FieldGroupTabsProps = {
    groups: FieldGroup[];
    values: Record<string, unknown>;
    onChange: (name: string, value: unknown) => void;
    disabled?: boolean;
};

export function FieldGroupTabs({
    groups,
    values,
    onChange,
    disabled,
}: FieldGroupTabsProps): React.ReactElement | null {
    const [activeTab, setActiveTab] = React.useState(groups[0]?.name ?? '');

    if (groups.length === 0) {
        return null;
    }

    return (
        <Tabs
            tabs={groups.map((group) => ({ label: group.label, value: group.name }))}
            value={activeTab}
            onChange={setActiveTab}
            renderPanel={(value) => {
                const group = groups.find((g) => g.name === value);
                if (!group) return null;
                return (
                    <FieldGroupPanel
                        group={group}
                        values={values}
                        onChange={onChange}
                        hideTitle
                        {...(disabled !== undefined && { disabled })}
                    />
                );
            }}
        />
    );
}
