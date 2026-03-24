/**
 * AppShell — root layout component for the Astromech admin SPA.
 *
 * Renders the sidebar and main content area, with the Topbar inside main.
 * On mobile the sidebar becomes a fixed overlay with a backdrop.
 */

import React from 'react';
import { Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@base-ui/react/dialog';
import { useUI } from '../../context/ui.js';
import { CommandPalette, CommandPaletteProvider } from '../ui/command-palette.js';
import { Sidebar } from './sidebar.js';
import { Topbar } from './topbar.js';
import { useHotkeys } from '../../hooks/index.js';

export function AppShell() {
    const { sidebarOpen, setSidebarOpen, shortcutsOpen, setShortcutsOpen } = useUI();
    const { t } = useTranslation();

    useHotkeys('?', () => setShortcutsOpen(true));

    return (
        <CommandPaletteProvider>
            <div className="am-shell" data-sidebar-open={sidebarOpen ? 'true' : 'false'}>
                {/* Mobile backdrop — visible only on small screens when sidebar is open */}
                <div
                    className="am-shell__backdrop"
                    onClick={() => setSidebarOpen(false)}
                    aria-hidden="true"
                />

                <Sidebar />

                <div className="am-shell__main">
                    <Topbar />
                    <main className="am-shell__content">
                        <Outlet />
                    </main>
                </div>
            </div>
            <CommandPalette />

            <Dialog.Root open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
                <Dialog.Portal>
                    <Dialog.Backdrop className="am-modal__backdrop" />
                    <Dialog.Popup className="am-modal__panel am-modal__panel--sm">
                        <div className="am-modal__header">
                            <Dialog.Title className="am-modal__title">{t('shortcuts.title')}</Dialog.Title>
                        </div>
                        <div className="am-modal__body">
                            <table className="am-shortcuts-table">
                                <tbody>
                                    <tr>
                                        <td className="am-shortcuts-table__keys">
                                            <div className="am-shortcuts-table__keys-inner">
                                                <kbd className="am-kbd">⌘K</kbd>
                                                <span className="am-shortcuts-table__sep">/</span>
                                                <kbd className="am-kbd">Ctrl+K</kbd>
                                            </div>
                                        </td>
                                        <td className="am-shortcuts-table__desc">{t('shortcuts.search')}</td>
                                    </tr>
                                    <tr>
                                        <td className="am-shortcuts-table__keys">
                                            <div className="am-shortcuts-table__keys-inner">
                                                <kbd className="am-kbd">⌘S</kbd>
                                                <span className="am-shortcuts-table__sep">/</span>
                                                <kbd className="am-kbd">Ctrl+S</kbd>
                                            </div>
                                        </td>
                                        <td className="am-shortcuts-table__desc">{t('shortcuts.save')}</td>
                                    </tr>
                                    <tr>
                                        <td className="am-shortcuts-table__keys">
                                            <div className="am-shortcuts-table__keys-inner">
                                                <kbd className="am-kbd">Escape</kbd>
                                            </div>
                                        </td>
                                        <td className="am-shortcuts-table__desc">{t('shortcuts.closeCancel')}</td>
                                    </tr>
                                    <tr>
                                        <td className="am-shortcuts-table__keys">
                                            <div className="am-shortcuts-table__keys-inner">
                                                <kbd className="am-kbd">?</kbd>
                                            </div>
                                        </td>
                                        <td className="am-shortcuts-table__desc">{t('shortcuts.showShortcuts')}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </Dialog.Popup>
                </Dialog.Portal>
            </Dialog.Root>
        </CommandPaletteProvider>
    );
}
