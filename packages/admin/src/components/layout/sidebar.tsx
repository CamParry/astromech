import type { AdminNavLink } from '../../hooks/use-admin-nav';
import type { PluginNavItem } from 'astromech';
import { Link, useRouterState } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Puzzle } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { useUi } from '../../context/ui';
import { useAdminNav } from '../../hooks/use-admin-nav';
import { resolveIcon } from '../../utilities/admin-icon';
import { Logo } from '../brand/logo';

export function Sidebar() {
    const { t } = useTranslation();
    const { sidebarOpen, setSidebarOpen } = useUi();
    const nav = useAdminNav();
    const pluginNavItems = nav.plugins.flatMap((plugin) => plugin.items);

    return (
        <aside
            className="am-sidebar"
            data-open={sidebarOpen ? 'true' : 'false'}
            aria-label={t('nav.primary')}
        >
            <div className="am-sidebar-start">
                <Logo />
                <span className="am-sidebar-brand-text">
                    {(adminConfig as { siteName?: string }).siteName ?? 'Astromech'}
                </span>
                <button
                    type="button"
                    className="am-sidebar-close"
                    onClick={() => setSidebarOpen(false)}
                    aria-label={t('nav.closeNav')}
                >
                    <ChevronLeft size={16} />
                </button>
            </div>
            <div className="am-sidebar-main">
                <nav className="am-sidebar-nav" aria-label={t('nav.primary')}>
                    <SidebarNavList links={nav.primary} />
                </nav>
                <div className="am-sidebar-nav-divider"></div>
                {nav.entryTypes.length > 0 && (
                    <nav className="am-sidebar-nav" aria-label={t('nav.entryTypes')}>
                        <SidebarNavList links={nav.entryTypes} />
                    </nav>
                )}
                {nav.globals.length > 0 && (
                    <>
                        <div className="am-sidebar-nav-divider"></div>
                        <nav className="am-sidebar-nav" aria-label={t('nav.globals')}>
                            <SidebarNavList links={nav.globals} />
                        </nav>
                    </>
                )}
                {nav.pages.length > 0 && (
                    <>
                        <div className="am-sidebar-nav-divider"></div>
                        <nav className="am-sidebar-nav" aria-label={t('nav.pages')}>
                            <SidebarNavList links={nav.pages} />
                        </nav>
                    </>
                )}
                {pluginNavItems.length > 0 && (
                    <>
                        <div className="am-sidebar-nav-divider"></div>
                        <nav className="am-sidebar-nav" aria-label={t('nav.plugins')}>
                            <ul className="am-sidebar-nav-list" role="list">
                                {pluginNavItems.map((item) => (
                                    <PluginNavEntry key={item.label} item={item} />
                                ))}
                            </ul>
                        </nav>
                    </>
                )}
                {nav.system.length > 0 && (
                    <>
                        <div className="am-sidebar-nav-divider"></div>
                        <nav className="am-sidebar-nav" aria-label={t('nav.system')}>
                            <SidebarNavList links={nav.system} />
                        </nav>
                    </>
                )}
            </div>
        </aside>
    );
}

function SidebarNavList({ links }: { links: AdminNavLink[] }) {
    return (
        <ul className="am-sidebar-nav-list" role="list">
            {links.map(({ to, label, Icon }) => (
                <SidebarNavItem
                    key={to}
                    to={to}
                    label={label}
                    icon={<Icon size={16} />}
                />
            ))}
        </ul>
    );
}

function PluginNavIcon({ name }: { name?: string | undefined }) {
    const Icon = resolveIcon(name, Puzzle);
    return <Icon size={16} />;
}

/** True when the pathname matches this item's link or any descendant's. */
function navItemContains(item: PluginNavItem, pathname: string): boolean {
    if (
        item.to !== undefined &&
        (pathname === item.to || pathname.startsWith(item.to + '/'))
    ) {
        return true;
    }
    return (item.children ?? []).some((child) => navItemContains(child, pathname));
}

function PluginNavEntry({ item }: { item: PluginNavItem }) {
    const children = item.children ?? [];
    const onlyChild = children.length === 1 ? children[0] : undefined;

    // A linkless group with a single leaf child flattens to one top-level
    // link — parent's label and icon, child's destination.
    if (
        item.to === undefined &&
        onlyChild !== undefined &&
        onlyChild.to !== undefined &&
        (onlyChild.children?.length ?? 0) === 0
    ) {
        return (
            <SidebarNavItem
                to={onlyChild.to}
                label={item.label}
                icon={<PluginNavIcon name={item.icon ?? onlyChild.icon} />}
            />
        );
    }

    if (children.length === 0) {
        if (item.to === undefined) return null;
        return (
            <SidebarNavItem
                to={item.to}
                label={item.label}
                icon={<PluginNavIcon name={item.icon} />}
            />
        );
    }

    return <PluginNavGroup item={item} children_={children} />;
}

function PluginNavGroup({
    item,
    children_,
}: {
    item: PluginNavItem;
    children_: PluginNavItem[];
}) {
    const { t } = useTranslation();
    const { sidebarOpen, setSidebarOpen } = useUi();
    const pathname = useRouterState().location.pathname;
    const childActive = children_.some((child) => navItemContains(child, pathname));
    const [expanded, setExpanded] = React.useState(childActive);

    React.useEffect(() => {
        if (childActive) setExpanded(true);
    }, [childActive]);

    const handleToggle = () => {
        // In icon-only mode children are hidden, so open the sidebar instead
        // of toggling into an invisible state.
        if (!sidebarOpen) {
            setSidebarOpen(true);
            setExpanded(true);
            return;
        }
        setExpanded((value) => !value);
    };

    // The parent stands in for its children while they're hidden.
    const parentActive = childActive && (!expanded || !sidebarOpen);
    const parentExact = item.to !== undefined && pathname === item.to;

    return (
        <li
            className={
                'am-sidebar-nav-item' +
                (parentActive || parentExact ? ' am-sidebar-nav-item-active' : '')
            }
        >
            {item.to !== undefined ? (
                <div className="am-sidebar-nav-group-row">
                    <Link
                        to={item.to}
                        className="am-sidebar-nav-item-link"
                        aria-current={parentExact ? 'page' : undefined}
                    >
                        <span className="am-sidebar-nav-item-icon">
                            <PluginNavIcon name={item.icon} />
                        </span>
                        <span className="am-sidebar-nav-item-label">{item.label}</span>
                    </Link>
                    <button
                        type="button"
                        className="am-sidebar-nav-group-chevron"
                        aria-expanded={expanded}
                        aria-label={
                            expanded
                                ? t('nav.collapseSection', { section: item.label })
                                : t('nav.expandSection', { section: item.label })
                        }
                        onClick={handleToggle}
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    className="am-sidebar-nav-item-link am-sidebar-nav-group-toggle"
                    aria-expanded={expanded}
                    onClick={handleToggle}
                >
                    <span className="am-sidebar-nav-item-icon">
                        <PluginNavIcon name={item.icon} />
                    </span>
                    <span className="am-sidebar-nav-item-label">{item.label}</span>
                    <span className="am-sidebar-nav-item-chevron">
                        <ChevronRight size={14} />
                    </span>
                </button>
            )}
            {expanded && (
                <ul className="am-sidebar-nav-sublist" role="list">
                    {children_.map((child) => (
                        <PluginNavEntry key={child.label} item={child} />
                    ))}
                </ul>
            )}
        </li>
    );
}

function SidebarNavItem({
    to,
    icon,
    label,
}: {
    to: string;
    icon: React.ReactNode;
    label: string;
}) {
    const routerState = useRouterState();
    const pathname = routerState.location.pathname;

    // The dashboard's `/` matches only itself: no admin path starts with `//`.
    const isActive = pathname === to || pathname.startsWith(to + '/');
    return (
        <li
            className={
                'am-sidebar-nav-item' + (isActive ? ' am-sidebar-nav-item-active' : '')
            }
        >
            <Link
                to={to}
                className="am-sidebar-nav-item-link"
                aria-current={isActive ? 'page' : undefined}
            >
                <span className="am-sidebar-nav-item-icon">{icon}</span>
                <span className="am-sidebar-nav-item-label">{label}</span>
            </Link>
        </li>
    );
}
