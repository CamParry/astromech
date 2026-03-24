/**
 * Collapsible — single expandable section built on Base UI Collapsible.
 */

import React from 'react';
import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible';
import { ChevronDown } from 'lucide-react';

type CollapsibleProps = {
    label: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
};

export function Collapsible({
    label,
    children,
    defaultOpen = false,
    open,
    onOpenChange,
}: CollapsibleProps): React.ReactElement {
    return (
        <BaseCollapsible.Root
            defaultOpen={defaultOpen}
            open={open}
            onOpenChange={onOpenChange}
            className="am-collapsible"
        >
            <BaseCollapsible.Trigger className="am-collapsible__trigger">
                {label}
                <ChevronDown size={14} className="am-collapsible__chevron" aria-hidden="true" />
            </BaseCollapsible.Trigger>
            <BaseCollapsible.Panel className="am-collapsible__panel">
                <div className="am-collapsible__content">{children}</div>
            </BaseCollapsible.Panel>
        </BaseCollapsible.Root>
    );
}

export type { CollapsibleProps };
