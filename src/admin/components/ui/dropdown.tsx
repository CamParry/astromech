import React from 'react';
import { Menu } from '@base-ui/react/menu';
import { ChevronDown } from 'lucide-react';

type DropdownItem = {
    label: string;
    onClick?: () => void;
    href?: string;
    variant?: 'default' | 'danger';
    disabled?: boolean;
    icon?: React.ReactNode;
};

type DropdownProps = {
    label?: string;
    icon?: React.ReactNode;
    ariaLabel?: string;
    variant?: 'ghost' | 'secondary' | 'primary' | 'danger';
    size?: 'sm' | 'md';
    items: DropdownItem[];
    align?: 'start' | 'end';
};

export function Dropdown({ label, icon, ariaLabel, variant = 'ghost', size, items, align = 'end' }: DropdownProps): React.ReactElement {
    const iconOnly = icon !== undefined && label === undefined;
    const effectiveSize = size ?? (iconOnly ? 'sm' : 'md');
    const triggerClass = [
        'am-btn',
        `am-btn--${variant}`,
        `am-btn--${effectiveSize}`,
        iconOnly ? 'am-btn--icon' : '',
    ].filter(Boolean).join(' ');

    return (
        <Menu.Root>
            <Menu.Trigger render={<button type="button" />} className={triggerClass} aria-label={ariaLabel}>
                {icon !== undefined && <span className="am-btn__icon">{icon}</span>}
                {label}
                {!iconOnly && <ChevronDown size={12} />}
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner className="am-dropdown__positioner" align={align} sideOffset={4}>
                    <Menu.Popup className="am-dropdown__popup">
                        {items.map((item, i) => {
                            const itemClass = [
                                'am-dropdown__item',
                                item.variant === 'danger' ? 'am-dropdown__item--danger' : '',
                            ]
                                .filter(Boolean)
                                .join(' ');

                            if (item.href !== undefined) {
                                return (
                                    <Menu.Item
                                        key={i}
                                        className={itemClass}
                                        disabled={item.disabled}
                                        render={<a href={item.href} />}
                                    >
                                        {item.icon !== undefined && (
                                            <span className="am-dropdown__item-icon">{item.icon}</span>
                                        )}
                                        {item.label}
                                    </Menu.Item>
                                );
                            }

                            return (
                                <Menu.Item
                                    key={i}
                                    className={itemClass}
                                    disabled={item.disabled}
                                    onClick={item.onClick}
                                >
                                    {item.icon !== undefined && (
                                        <span className="am-dropdown__item-icon">{item.icon}</span>
                                    )}
                                    {item.label}
                                </Menu.Item>
                            );
                        })}
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}

export type { DropdownProps, DropdownItem };

