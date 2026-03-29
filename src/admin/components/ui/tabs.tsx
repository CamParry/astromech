import React from 'react';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { clsx } from 'clsx';

type Tab = { label: string; value: string };

type TabsProps = {
    tabs: Tab[];
    value: string;
    onChange: (value: string) => void;
    children?: React.ReactNode;
};

export function Tabs({ tabs, value, onChange, children }: TabsProps): React.ReactElement {
    return (
        <BaseTabs.Root className="am-tabs" value={value} onValueChange={onChange}>
            <BaseTabs.List className="am-tabs-list">
                {tabs.map((tab) => (
                    <BaseTabs.Tab
                        key={tab.value}
                        value={tab.value}
                        className={clsx(
                            'am-tabs-tab',
                            value === tab.value && 'am-tabs-tab-active'
                        )}
                    >
                        {tab.label}
                    </BaseTabs.Tab>
                ))}
            </BaseTabs.List>
            {tabs.map((tab) => (
                <BaseTabs.Panel
                    key={tab.value}
                    value={tab.value}
                    className="am-tabs-panel"
                >
                    {value === tab.value ? children : null}
                </BaseTabs.Panel>
            ))}
        </BaseTabs.Root>
    );
}

export type { Tab, TabsProps };
