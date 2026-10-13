import { Menu } from '@base-ui/react/menu';
import { MoreHorizontal } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

/** One item of a `MoreActionsMenu`. */
type MoreActionsItem = {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    /** A destructive item, set apart from the rest by a separator. */
    variant?: 'danger';
};

type MoreActionsMenuProps = {
    items: MoreActionsItem[];
};

/**
 * The "…" menu in an edit screen's header, beside Save: the record's less
 * common actions, with the destructive ones last and set apart.
 */
export function MoreActionsMenu({ items }: MoreActionsMenuProps): React.ReactElement {
    const { t } = useTranslation();
    const firstDanger = items.findIndex((item) => item.variant === 'danger');

    return (
        <Menu.Root>
            <Menu.Trigger
                className="am-btn am-btn-secondary am-btn-md am-btn-icon"
                aria-label={t('common.moreActions')}
            >
                <MoreHorizontal size={16} />
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner
                    className="am-topbar-menu-positioner"
                    sideOffset={6}
                    align="end"
                >
                    <Menu.Popup className="am-topbar-menu-popup">
                        {items.map((item, index) => (
                            <React.Fragment key={item.label}>
                                {index === firstDanger && index > 0 && (
                                    <Menu.Separator className="am-topbar-menu-separator" />
                                )}
                                <Menu.Item
                                    className={
                                        item.variant === 'danger'
                                            ? 'am-topbar-menu-item am-topbar-menu-item-danger'
                                            : 'am-topbar-menu-item'
                                    }
                                    onClick={item.onClick}
                                    disabled={item.disabled}
                                >
                                    <span className="am-topbar-menu-item-icon">
                                        {item.icon}
                                    </span>
                                    {item.label}
                                </Menu.Item>
                            </React.Fragment>
                        ))}
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}
