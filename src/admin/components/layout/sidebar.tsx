import React from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
    LayoutDashboard,
    Image,
    Users,
    Settings,
    Database,
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
                                    icon={<Database size={16} />}
                                />
                            ))}
                        </ul>
                    </nav>
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

function PluginNavEntry({ item }: { item: PluginNavItem }) {
    const children = item.children ?? [];
    return (
        <>
            {item.to !== undefined ? (
                <SidebarNavItem
                    to={item.to}
                    label={item.label}
                    icon={<PluginNavIcon name={item.icon} />}
                />
            ) : (
                <li className="am-sidebar-nav-item">
                    <span className="am-sidebar-nav-item-link am-sidebar-nav-item-static">
                        <span className="am-sidebar-nav-item-icon">
                            <PluginNavIcon name={item.icon} />
                        </span>
                        <span className="am-sidebar-nav-item-label">{item.label}</span>
                    </span>
                </li>
            )}
            {children.length > 0 && (
                <li>
                    <ul className="am-sidebar-nav-sublist" role="list">
                        {children.map((child) => (
                            <PluginNavEntry key={child.label} item={child} />
                        ))}
                    </ul>
                </li>
            )}
        </>
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
