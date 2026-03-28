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
} from 'lucide-react';
import adminConfig from 'virtual:astromech/admin-config';
import { useUI } from '../../context/ui.js';
import { usePermissions } from '../../hooks/index.js';
import { Logo } from '../brand/Brand.js';

export function Sidebar() {
    const { t } = useTranslation();
    const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUI();
    const { canReadMedia, canReadUsers, canReadSettings } = usePermissions();
    const entryTypes = Object.entries(adminConfig.entries);

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
