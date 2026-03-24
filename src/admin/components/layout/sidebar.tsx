/**
 * Sidebar navigation component for the Astromech admin SPA.
 */

import React from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

// ============================================================================
// Logo
// ============================================================================

function AstromechLogo({ size = 28 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 26 26"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
        >
            <rect width="26" height="26" rx="6" fill="var(--am-color-primary-500)" />
            {/* Stylised A mark */}
            <path
                d="M13 5L20 20H6L13 5Z"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinejoin="round"
            />
            <line
                x1="9.5"
                y1="15"
                x2="16.5"
                y2="15"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}
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

// ============================================================================
// Types
// ============================================================================

type NavItem = {
    labelKey: string;
    to: string;
    icon: React.ReactNode;
};

// ============================================================================
// Nav items
// ============================================================================

const PRIMARY_NAV: NavItem[] = [
    { labelKey: 'nav.dashboard', to: '/', icon: <LayoutDashboard size={16} /> },
    { labelKey: 'nav.media', to: '/media', icon: <Image size={16} /> },
];

const BOTTOM_NAV: NavItem[] = [
    { labelKey: 'nav.users', to: '/users', icon: <Users size={16} /> },
    { labelKey: 'nav.settings', to: '/settings', icon: <Settings size={16} /> },
];

// ============================================================================
// NavLink
// ============================================================================

type NavLinkProps = {
    to: string;
    children: React.ReactNode;
    exact?: boolean;
};

function NavLink({ to, children, exact = false }: NavLinkProps) {
    const routerState = useRouterState();
    const pathname = routerState.location.pathname;

    const isActive = exact
        ? pathname === to
        : pathname === to || pathname.startsWith(to + '/');

    return (
        <Link
            to={to}
            className={
                'am-sidebar__nav-item' + (isActive ? ' am-sidebar__nav-item--active' : '')
            }
            aria-current={isActive ? 'page' : undefined}
        >
            {children}
        </Link>
    );
}

// ============================================================================
// Sidebar
// ============================================================================

export function Sidebar() {
    const { t } = useTranslation();
    const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUI();
    const collections = Object.entries(adminConfig.collections);

    return (
        <aside
            className="am-sidebar"
            data-open={sidebarOpen ? 'true' : 'false'}
            aria-label={t('nav.primary')}
        >
            {/* Brand */}
            <div className="am-sidebar__brand">
                <AstromechLogo />
                <span className="am-sidebar__brand-text">
                    {(adminConfig as { siteName?: string }).siteName ?? 'Astromech'}
                </span>
                {/* Mobile close button */}
                <button
                    type="button"
                    className="am-sidebar__close"
                    onClick={() => setSidebarOpen(false)}
                    aria-label={t('nav.closeNav')}
                >
                    <ChevronLeft size={16} />
                </button>
            </div>

            {/* Scrollable nav area */}
            <div className="am-sidebar__scroll">
                {/* Primary nav */}
                <nav className="am-sidebar__nav" aria-label={t('nav.primary')}>
                    <ul className="am-sidebar__nav-list" role="list">
                        {PRIMARY_NAV.map((item) => (
                            <li key={item.to}>
                                <NavLink to={item.to} exact={item.to === '/'}>
                                    <span className="am-sidebar__nav-icon">
                                        {item.icon}
                                    </span>
                                    <span className="am-sidebar__nav-label">
                                        {t(item.labelKey)}
                                    </span>
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </nav>

                <div className="am-sidebar__nav--divider"></div>

                {/* Collections nav */}
                {collections.length > 0 && (
                    <nav className="am-sidebar__nav" aria-label={t('nav.collections')}>
                        <span className="am-sidebar__nav-heading">
                            {t('nav.collections')}
                        </span>
                        <ul className="am-sidebar__nav-list" role="list">
                            {collections.map(([key, collection]) => (
                                <li key={key}>
                                    <NavLink to={`/collections/${key}`}>
                                        <span className="am-sidebar__nav-icon">
                                            <Database size={16} />
                                        </span>
                                        <span className="am-sidebar__nav-label">
                                            {collection.plural}
                                        </span>
                                    </NavLink>
                                </li>
                            ))}
                        </ul>
                    </nav>
                )}
            </div>

            <div className="am-sidebar__nav--divider"></div>

            <nav
                className="am-sidebar__nav am-sidebar__nav--bottom"
                aria-label={t('nav.system')}
            >
                <ul className="am-sidebar__nav-list" role="list">
                    {BOTTOM_NAV.map((item) => (
                        <li key={item.to}>
                            <NavLink to={item.to}>
                                <span className="am-sidebar__nav-icon">{item.icon}</span>
                                <span className="am-sidebar__nav-label">
                                    {t(item.labelKey)}
                                </span>
                            </NavLink>
                        </li>
                    ))}
                </ul>
                <button
                    type="button"
                    className="am-sidebar__toggle"
                    onClick={toggleSidebar}
                    aria-label={
                        sidebarOpen ? t('nav.collapseSidebar') : t('nav.expandSidebar')
                    }
                >
                    {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                </button>
            </nav>

            {/* Bottom nav — pinned */}
            {/* <div className="am-sidebar__bottom"> */}
            {/* Collapse toggle (desktop only) */}
            {/* </div> */}
        </aside>
    );
}
