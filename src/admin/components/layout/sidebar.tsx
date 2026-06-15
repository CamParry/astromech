import React from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
    LayoutDashboard,
    Image,
    Users,
    Settings,
    ChevronLeft,
    ChevronRight,
    Puzzle,
    icons,
} from 'lucide-react';
import adminConfig from 'virtual:astromech/admin-config';
import type { PluginNavItem } from '@/types/index.js';
import { useUI } from '../../context/ui.js';
import { usePermissions } from '../../hooks/index.js';
import { Logo } from '../brand/Brand.js';
import { EntryTypeIcon } from '../ui/entry-type-icon.js';
import { resolveLabel } from '../../i18n/labels.js';


/**
 * Drop nav items the user lacks permission for, recursively. A linkless
 * parent whose children are all hidden disappears too.
 */
function filterNavItems(
    items: PluginNavItem[],
    allowed: (permission: string) => boolean
): PluginNavItem[] {
    return items
        .filter((item) => item.permission === undefined || allowed(item.permission))
        .map((item) => ({
            ...item,
            ...(item.children !== undefined && {
                children: filterNavItems(item.children, allowed),
            }),
        }))
        .filter((item) => item.to !== undefined || (item.children?.length ?? 0) > 0);
}

export function Sidebar() {
    const { t } = useTranslation();
    const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUI();
    const { canReadMedia, canReadUsers, canReadSettings, hasPermission } =
        usePermissions();
    const entryTypes = Object.entries(adminConfig.entries);
    const appPages = adminConfig.pages ?? [];
    const pluginNavItems = filterNavItems(
        adminConfig.plugins.flatMap((plugin) => plugin.nav),
        hasPermission
    );

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
                    <ul className="am-sidebar-nav-list" role="list">
                        <SidebarNavItem
                            to="/"
                            exact
                            label={t('nav.dashboard')}
                            icon={<LayoutDashboard size={16} />}
                        />
                        {canReadMedia() && (
                            <SidebarNavItem
                                to="/media"
                                label={t('nav.media')}
                                icon={<Image size={16} />}
                            />
                        )}
                    </ul>
                </nav>
                <div className="am-sidebar-nav-divider"></div>
                {entryTypes.length > 0 && (
                    <nav className="am-sidebar-nav" aria-label="Entry types">
                        <ul className="am-sidebar-nav-list" role="list">
                            {entryTypes.map(([key, entryType]) => (
                                <SidebarNavItem
                                    key={key}
                                    to={`/entries/${key}`}
                                    label={entryType.plural}
                                    icon={<EntryTypeIcon name={entryType.icon} />}
                                />
                            ))}
                        </ul>
                    </nav>
                )}
                {appPages.length > 0 && canReadSettings() && (
                    <>
                        <div className="am-sidebar-nav-divider"></div>
                        <nav className="am-sidebar-nav" aria-label={t('nav.pages')}>
                            <ul className="am-sidebar-nav-list" role="list">
                                {appPages.map((page) => (
                                    <SidebarNavItem
                                        key={page.path}
                                        to={`/page/${page.path}`}
                                        label={resolveLabel(page.label, page.path, t, 'translation')}
                                        icon={<PluginNavIcon name={page.icon} />}
                                    />
                                ))}
                            </ul>
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
            </div>
            <div className="am-sidebar-end">
                <nav className="am-sidebar-nav" aria-label={t('nav.system')}>
                    <ul className="am-sidebar-nav-list" role="list">
                        {canReadUsers() && (
                            <SidebarNavItem
                                to="/users"
                                label={t('nav.users')}
                                icon={<Users size={16} />}
                            />
                        )}
                        {canReadSettings() && (
                            <SidebarNavItem
                                to="/settings"
                                label={t('nav.settings')}
                                icon={<Settings size={16} />}
                            />
                        )}
                    </ul>
                    <button
                        type="button"
                        className="am-sidebar-toggle"
                        onClick={toggleSidebar}
                        aria-label={
                            sidebarOpen
                                ? t('nav.collapseSidebar')
                                : t('nav.expandSidebar')
                        }
                    >
                        {sidebarOpen ? (
                            <ChevronLeft size={16} />
                        ) : (
                            <ChevronRight size={16} />
                        )}
                    </button>
                </nav>
            </div>
        </aside>
    );
}

function PluginNavIcon({ name }: { name?: string | undefined }) {
    const Icon =
        name !== undefined ? (icons[name as keyof typeof icons] ?? Puzzle) : Puzzle;
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
    const { sidebarOpen, setSidebarOpen } = useUI();
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
    exact = false,
}: {
    to: string;
    icon: React.ReactNode;
    label: string;
    exact?: boolean;
}) {
    const routerState = useRouterState();
    const pathname = routerState.location.pathname;

    const isActive = exact
        ? pathname === to
        : pathname === to || pathname.startsWith(to + '/');
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
