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
                <BaseAccordion.Item key={item.value} value={item.value} className="am-accordion__item">
                    <BaseAccordion.Header className="am-accordion__header">
                        <BaseAccordion.Trigger className="am-accordion__trigger">
                            {item.label}
                            <ChevronDown size={16} className="am-accordion__chevron" aria-hidden="true" />
                        </BaseAccordion.Trigger>
                    </BaseAccordion.Header>
                    <BaseAccordion.Panel className="am-accordion__panel">
                        <div className="am-accordion__content">{item.children}</div>
                    </BaseAccordion.Panel>
                </BaseAccordion.Item>
            ))}
        </BaseAccordion.Root>
    );
}

export type { AccordionProps, AccordionItem };
