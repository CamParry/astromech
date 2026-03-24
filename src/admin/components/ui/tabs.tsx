import React from 'react';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';

type Tab = { label: string; value: string };

type TabsProps = {
    tabs: Tab[];
    value: string;
    onChange: (value: string) => void;
    children?: React.ReactNode;
};

export function Tabs({ tabs, value, onChange, children }: TabsProps): React.ReactElement {
    return (
        <BaseTabs.Root
            className="am-tabs"
            value={value}
            onValueChange={onChange}
        >
            <BaseTabs.List className="am-tabs__list">
                {tabs.map((tab) => (
                    <BaseTabs.Tab
                        key={tab.value}
                        value={tab.value}
                        className={['am-tabs__tab', value === tab.value ? 'am-tabs__tab--active' : ''].filter(Boolean).join(' ')}
                    >
                        {tab.label}
                    </BaseTabs.Tab>
                ))}
            </BaseTabs.List>
            {tabs.map((tab) => (
                <BaseTabs.Panel key={tab.value} value={tab.value} className="am-tabs__panel">
                    {value === tab.value ? children : null}
                </BaseTabs.Panel>
            ))}
        </BaseTabs.Root>
    );
}

export type { Tab, TabsProps };
