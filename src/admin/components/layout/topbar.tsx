/**
 * Topbar component for the Astromech admin SPA.
 *
 * Layout: [Menu toggle (mobile)] [Brand] [Search] [Bell] [Quick-create] [User menu]
 */

import React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Menu } from '@base-ui/react/menu';
import { Bell, CircleHelp, FilePlus, LogOut, Menu as MenuIcon, Monitor, Moon, Plus, Search, Sun, UserIcon } from 'lucide-react';
import adminConfig from 'virtual:astromech/admin-config';
import { useAuth } from '../../context/auth.js';
import { useUI } from '../../context/ui.js';
import { useTheme } from '../../context/theme.js';
import { useCommandPalette } from '../ui/command-palette.js';

export function Topbar() {
    const { user, logout } = useAuth();
    const { setSidebarOpen, setShortcutsOpen } = useUI();
    const { theme, setTheme } = useTheme();
    const { setOpen: openCommandPalette } = useCommandPalette();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const collections = Object.entries(adminConfig.collections);

    async function handleLogout() {
        await logout();
        void navigate({ to: '/login' });
    }

    return (
        <header className="am-topbar">
            <div className="am-topbar__left">
                {/* Mobile menu toggle */}
                <button
                    type="button"
                    className="am-topbar__menu-toggle"
                    onClick={() => setSidebarOpen(true)}
                    aria-label={t('nav.openNav')}
                >
                    <MenuIcon size={18} />
                </button>

                {/* Brand (mobile only — desktop brand lives in sidebar) */}
                <span className="am-topbar__brand">{t('topbar.brand')}</span>
            </div>

            {/* Global search */}
            <div className="am-topbar__center">
                <div className="am-topbar__search">
                    <button
                        type="button"
                        className="am-topbar__search-btn"
                        aria-label={t('topbar.searchLabel')}
                        onClick={() => openCommandPalette(true)}
                    >
                        <Search size={15} className="am-topbar__search-icon" />
                        <span className="am-topbar__search-placeholder">{t('topbar.searchPlaceholder')}</span>
                        <kbd className="am-topbar__search-kbd">⌘K</kbd>
                    </button>
                </div>
            </div>

            {/* Right actions */}
            <div className="am-topbar__right">
                {/* Help */}
                <button
                    type="button"
                    className="am-topbar__action-btn"
                    aria-label={t('topbar.keyboardShortcutsLabel')}
                    onClick={() => setShortcutsOpen(true)}
                >
                    <CircleHelp size={17} />
                </button>

                {/* Notification bell */}
                <button
                    type="button"
                    className="am-topbar__action-btn"
                    aria-label={t('topbar.notificationsLabel')}
                >
                    <Bell size={17} />
                </button>

                {/* Theme toggle */}
                <button
                    type="button"
                    className="am-topbar__action-btn"
                    aria-label={
                        theme === 'light'
                            ? t('topbar.themeLight')
                            : theme === 'dark'
                              ? t('topbar.themeDark')
                              : t('topbar.themeSystem')
                    }
                    onClick={() => {
                        const next =
                            theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto';
                        setTheme(next);
                    }}
                >
                    {theme === 'light' ? (
                        <Sun size={17} />
                    ) : theme === 'dark' ? (
                        <Moon size={17} />
                    ) : (
                        <Monitor size={17} />
                    )}
                </button>

                {/* Quick create */}
                {collections.length > 0 && (
                    <Menu.Root>
                        <Menu.Trigger
                            className="am-topbar__action-btn am-topbar__action-btn--create"
                            aria-label={t('topbar.createNewLabel')}
                        >
                            <Plus size={17} />
                        </Menu.Trigger>
                        <Menu.Portal>
                            <Menu.Positioner
                                className="am-topbar__menu-positioner"
                                sideOffset={8}
                                align="end"
                            >
                                <Menu.Popup className="am-topbar__menu-popup">
                                    <div className="am-topbar__menu-section-heading">
                                        {t('topbar.createNewHeading')}
                                    </div>
                                    {collections.map(([key, collection]) => (
                                        <Menu.Item
                                            key={key}
                                            className="am-topbar__menu-item"
                                            onClick={() =>
                                                void navigate({
                                                    to: `/collections/${key}/new`,
                                                })
                                            }
                                        >
                                            <span className="am-topbar__menu-item-icon"><FilePlus size={14} /></span>
                                            {collection.single}
                                        </Menu.Item>
                                    ))}
                                </Menu.Popup>
                            </Menu.Positioner>
                        </Menu.Portal>
                    </Menu.Root>
                )}

                {/* User menu */}
                {user && (
                    <Menu.Root>
                        <Menu.Trigger className="am-topbar__user-btn" aria-label={t('topbar.userMenuLabel')}>
                            <UserIcon size={16} />
                        </Menu.Trigger>
                        <Menu.Portal>
                            <Menu.Positioner
                                className="am-topbar__menu-positioner"
                                sideOffset={8}
                                align="end"
                            >
                                <Menu.Popup className="am-topbar__menu-popup">
                                    <div className="am-topbar__menu-header">
                                        <span className="am-topbar__menu-name">{user.name}</span>
                                        <span className="am-topbar__menu-email">{user.email}</span>
                                    </div>
                                    <Menu.Separator className="am-topbar__menu-separator" />
                                    <Menu.Item
                                        className="am-topbar__menu-item am-topbar__menu-item--danger"
                                        onClick={handleLogout}
                                    >
                                        <span className="am-topbar__menu-item-icon"><LogOut size={14} /></span>
                                        {t('topbar.logout')}
                                    </Menu.Item>
                                </Menu.Popup>
                            </Menu.Positioner>
                        </Menu.Portal>
                    </Menu.Root>
                )}
            </div>
        </header>
    );
}
