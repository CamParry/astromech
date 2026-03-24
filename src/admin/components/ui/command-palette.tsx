/**
 * CommandPalette — Cmd+K global search and navigation palette.
 *
 * Provides a context/provider for open state, a global keyboard shortcut,
 * and a modal UI with grouped, filterable navigation items.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@base-ui/react/dialog';
import { useNavigate } from '@tanstack/react-router';
import { Image, LayoutDashboard, Settings, Users, FolderOpen } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import adminConfig from 'virtual:astromech/admin-config';

// ============================================================================
// Types
// ============================================================================

type CommandItem = {
    id: string;
    label: string;
    to: string;
    group: 'Navigation' | 'Collections';
    icon: LucideIcon;
};

type CommandPaletteContextValue = {
    open: boolean;
    setOpen: (open: boolean) => void;
};

// ============================================================================
// Context
// ============================================================================

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette(): CommandPaletteContextValue {
    const ctx = useContext(CommandPaletteContext);
    if (ctx === null) {
        throw new Error('useCommandPalette must be used within a CommandPaletteProvider');
    }
    return ctx;
}

// ============================================================================
// Provider
// ============================================================================

type CommandPaletteProviderProps = {
    children: React.ReactNode;
};

export function CommandPaletteProvider({ children }: CommandPaletteProviderProps): React.ReactElement {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setOpen(true);
            }
        }

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    return (
        <CommandPaletteContext.Provider value={{ open, setOpen }}>
            {children}
        </CommandPaletteContext.Provider>
    );
}

// ============================================================================
// Command Palette modal
// ============================================================================

export function CommandPalette(): React.ReactElement {
    const { open, setOpen } = useCommandPalette();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    // Build nav items using translated labels at render time
    const navItems: CommandItem[] = [
        { id: 'nav-dashboard', label: t('nav.dashboard'), to: '/', group: 'Navigation', icon: LayoutDashboard },
        { id: 'nav-media', label: t('nav.media'), to: '/media', group: 'Navigation', icon: Image },
        { id: 'nav-users', label: t('nav.users'), to: '/users', group: 'Navigation', icon: Users },
        { id: 'nav-settings', label: t('nav.settings'), to: '/settings', group: 'Navigation', icon: Settings },
    ];

    // Build collection items from adminConfig at render time
    const collectionItems: CommandItem[] = Object.entries(adminConfig.collections).map(
        ([key, col]) => ({
            id: `col-${key}`,
            label: col.plural,
            to: `/collections/${key}`,
            group: 'Collections' as const,
            icon: FolderOpen,
        }),
    );

    const allItems: CommandItem[] = [...navItems, ...collectionItems];

    const filtered = query.trim() === ''
        ? allItems
        : allItems.filter((item) =>
              item.label.toLowerCase().includes(query.toLowerCase()),
          );

    // Reset state when palette opens
    useEffect(() => {
        if (open) {
            setQuery('');
            setActiveIndex(0);
            // Focus input on next tick after Dialog renders
            requestAnimationFrame(() => {
                inputRef.current?.focus();
            });
        }
    }, [open]);

    // Keep active index in bounds when results change
    useEffect(() => {
        setActiveIndex((prev) => (filtered.length === 0 ? 0 : Math.min(prev, filtered.length - 1)));
    }, [filtered.length]);

    const activate = useCallback(
        (item: CommandItem) => {
            setOpen(false);
            void navigate({ to: item.to });
        },
        [navigate, setOpen],
    );

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((prev) => (prev + 1) % Math.max(filtered.length, 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((prev) => (prev - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const item = filtered[activeIndex];
            if (item !== undefined) {
                activate(item);
            }
        }
    }

    // Group filtered items for rendering
    const groups: Array<{ label: string; items: CommandItem[] }> = [];
    const groupOrder: Array<CommandItem['group']> = ['Navigation', 'Collections'];
    const groupLabels: Record<CommandItem['group'], string> = {
        Navigation: t('cmdpal.groupNavigation'),
        Collections: t('cmdpal.groupCollections'),
    };
    for (const groupName of groupOrder) {
        const items = filtered.filter((item) => item.group === groupName);
        if (items.length > 0) {
            groups.push({ label: groupLabels[groupName], items });
        }
    }

    // Compute a flat index offset per group for active tracking
    const flatIndex = (groupIdx: number, itemIdx: number): number => {
        let offset = 0;
        for (let g = 0; g < groupIdx; g++) {
            offset += groups[g]?.items.length ?? 0;
        }
        return offset + itemIdx;
    };

    return (
        <Dialog.Root
            open={open}
            onOpenChange={(o) => {
                if (!o) setOpen(false);
            }}
        >
            <Dialog.Portal>
                <Dialog.Backdrop className="am-modal__backdrop" />
                <Dialog.Popup
                    className="am-modal__panel am-cmdpal"
                    onKeyDown={handleKeyDown}
                    aria-label={t('cmdpal.ariaLabel')}
                >
                    <div className="am-cmdpal__input-wrap">
                        <input
                            ref={inputRef}
                            type="text"
                            className="am-cmdpal__input"
                            placeholder={t('cmdpal.searchPlaceholder')}
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setActiveIndex(0);
                            }}
                            autoComplete="off"
                            spellCheck={false}
                        />
                    </div>

                    <div className="am-cmdpal__results" role="listbox" aria-label={t('cmdpal.resultsLabel')}>
                        {filtered.length === 0 && (
                            <div className="am-cmdpal__empty">{t('cmdpal.noResults')}</div>
                        )}
                        {groups.map((group, groupIdx) => (
                            <div key={group.label} className="am-cmdpal__group">
                                <div className="am-cmdpal__group-heading">{group.label}</div>
                                {group.items.map((item, itemIdx) => {
                                    const idx = flatIndex(groupIdx, itemIdx);
                                    const isActive = idx === activeIndex;
                                    const Icon = item.icon;
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            role="option"
                                            aria-selected={isActive}
                                            className={
                                                isActive
                                                    ? 'am-cmdpal__item am-cmdpal__item--active'
                                                    : 'am-cmdpal__item'
                                            }
                                            onMouseEnter={() => setActiveIndex(idx)}
                                            onClick={() => activate(item)}
                                        >
                                            <span className="am-cmdpal__item-icon">
                                                <Icon size={15} />
                                            </span>
                                            <span className="am-cmdpal__item-label">{item.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
