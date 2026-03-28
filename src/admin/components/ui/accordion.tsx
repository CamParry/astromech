/**
 * Accordion — collapsible panels built on Base UI Accordion.
 */

import React from 'react';
import { Accordion as BaseAccordion } from '@base-ui/react/accordion';
import { ChevronDown } from 'lucide-react';

type AccordionItem = {
    value: string;
    label: string;
    children: React.ReactNode;
};

type AccordionProps = {
    items: AccordionItem[];
    defaultValue?: string[];
    multiple?: boolean;
};

export function Accordion({ items, defaultValue, multiple = false }: AccordionProps): React.ReactElement {
    return (
        <BaseAccordion.Root
            defaultValue={defaultValue}
            multiple={multiple}
            className="am-accordion"
        >
            {items.map((item) => (
                <BaseAccordion.Item key={item.value} value={item.value} className="am-accordion-item">
                    <BaseAccordion.Header className="am-accordion-header">
                        <BaseAccordion.Trigger className="am-accordion-trigger">
                            {item.label}
                            <ChevronDown size={16} className="am-accordion-chevron" aria-hidden="true" />
                        </BaseAccordion.Trigger>
                    </BaseAccordion.Header>
                    <BaseAccordion.Panel className="am-accordion-panel">
                        <div className="am-accordion-content">{item.children}</div>
                    </BaseAccordion.Panel>
                </BaseAccordion.Item>
            ))}
        </BaseAccordion.Root>
    );
}

export type { AccordionProps, AccordionItem };
