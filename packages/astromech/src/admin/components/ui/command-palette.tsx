/**
 * Cmd+K global search and navigation palette: a context/provider for open
 * state, a keyboard shortcut, and a modal with grouped, filterable nav items.
 * Static shortcuts filter client-side; a non-empty query also runs live search.
 */

import type { AdminEntryType, Entry, Media, User } from '@/types/index';
import type { LucideIcon } from 'lucide-react';
import { Dialog } from '@base-ui/react/dialog';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { icons, Image, LayoutDashboard, Puzzle, Users } from 'lucide-react';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { entryLabel } from '@/admin/components/entries/entry-label';
import { entryAdminPath } from '@/admin/utilities/entry-admin-path';
import { parseEntryTypeId } from '@/entries/type-ids.shared';
import { astromechClient } from '@/transport/http/client/index';
import { usePermissions } from '../../hooks/index';
import { useDebounce } from '../../hooks/use-debounce';
import { EntryTypeIcon } from './entry-type-icon';

function lucideIcon(name: string | undefined, Fallback: LucideIcon): LucideIcon {
    if (name === undefined) return Fallback;
    return (icons[name as keyof typeof icons] ?? Fallback) as LucideIcon;
}

/** Groups rendered in the palette. Static = always computed client-side. */
type StaticGroup = 'Navigation' | 'EntryTypes' | 'Pages';

type StaticCommandItem = {
    kind: 'static';
    id: string;
    label: string;
    to: string;
    group: StaticGroup;
    Icon: () => React.ReactElement;
};

type LiveCommandItem = {
    kind: 'live';
    id: string;
    label: string;
    sublabel?: string;
    to: string;
    /** Search params appended on activation, e.g. the media modal's `?item=`. */
    search?: Record<string, string>;
    group: 'LiveEntries' | 'LiveUsers' | 'LiveMedia';
    /** For entry results: the entry type id + its plural label, used to split
     * live entries into one group per entry type. */
    typeId?: string;
    typeLabel?: string;
    Icon: () => React.ReactElement;
};

type CommandItem = StaticCommandItem | LiveCommandItem;

type CommandPaletteContextValue = {
    open: boolean;
    setOpen: (open: boolean) => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

/** Reads open state from `CommandPaletteProvider`. */
export function useCommandPalette(): CommandPaletteContextValue {
    const ctx = useContext(CommandPaletteContext);
    if (ctx === null) {
        throw new Error('useCommandPalette must be used within a CommandPaletteProvider');
    }
    return ctx;
}

type CommandPaletteProviderProps = {
    children: React.ReactNode;
};

/** Provides the palette's open state and installs the Cmd+K/Ctrl+K shortcut. */
export function CommandPaletteProvider({
    children,
}: CommandPaletteProviderProps): React.ReactElement {
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

type LiveResults = {
    entries: Entry[];
    users: User[];
    media: Media[];
};

/** The Cmd+K modal: input, static/live grouped results, and keyboard navigation. */
export function CommandPalette(): React.ReactElement {
    const { open, setOpen } = useCommandPalette();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const { hasPermission, canReadUsers, canReadMedia } = usePermissions();

    // Debounce the typed query for live search
    const debouncedQuery = useDebounce(query.trim(), 200);

    const navItems: StaticCommandItem[] = useMemo(
        () => [
            {
                kind: 'static' as const,
                id: 'nav-dashboard',
                label: t('nav.dashboard'),
                to: '/',
                group: 'Navigation' as const,
                Icon: () => <LayoutDashboard size={15} />,
            },
            {
                kind: 'static' as const,
                id: 'nav-media',
                label: t('nav.media'),
                to: '/media',
                group: 'Navigation' as const,
                Icon: () => <Image size={15} />,
            },
            {
                kind: 'static' as const,
                id: 'nav-users',
                label: t('nav.users'),
                to: '/users',
                group: 'Navigation' as const,
                Icon: () => <Users size={15} />,
            },
        ],
        [t]
    );

    const entryTypeItems: StaticCommandItem[] = useMemo(
        () =>
            Object.entries(adminConfig.entries).map(([key, entryType]) => ({
                kind: 'static' as const,
                id: `entry-type-${key}`,
                label: entryType.plural,
                to: `/entries/${key}`,
                group: 'EntryTypes' as const,
                Icon: () => <EntryTypeIcon name={entryType.icon} size={15} />,
            })),
        []
    );

    // Flatten plugin nav pages (items with a `to`) recursively, permission-filtered.
    // A plugin's label only prefixes its pages when it contributes more than one
    // (e.g. "SEO: Settings", "SEO: Sitemap"); a single-page plugin shows the page
    // label alone, so a flat plugin like redirects reads "Redirects", not
    // "Redirects: Redirects".
    const pluginPageItems: StaticCommandItem[] = useMemo(() => {
        const result: StaticCommandItem[] = [];

        type NavPage = (typeof adminConfig.plugins)[0]['nav'][number];

        for (const plugin of adminConfig.plugins) {
            const pages: NavPage[] = [];
            function collect(items: typeof plugin.nav) {
                for (const item of items) {
                    if (
                        item.permission !== undefined &&
                        !hasPermission(item.permission)
                    ) {
                        continue;
                    }
                    if (item.to !== undefined) pages.push(item);
                    if (item.children !== undefined && item.children.length > 0) {
                        collect(item.children);
                    }
                }
            }
            collect(plugin.nav);

            const prefixed = pages.length > 1;
            for (const item of pages) {
                const IconRef = lucideIcon(item.icon, Puzzle);
                result.push({
                    kind: 'static' as const,
                    id: `plugin-page-${item.to}`,
                    label: prefixed ? `${plugin.label}: ${item.label}` : item.label,
                    to: item.to as string,
                    group: 'Pages' as const,
                    Icon: () => <IconRef size={15} />,
                });
            }
        }

        return result;
    }, [hasPermission]);

    const allStaticItems: StaticCommandItem[] = useMemo(
        () => [...navItems, ...entryTypeItems, ...pluginPageItems],
        [navItems, entryTypeItems, pluginPageItems]
    );

    const q = query.toLowerCase();
    const filteredStatic =
        query.trim() === ''
            ? allStaticItems
            : allStaticItems.filter((item) => item.label.toLowerCase().includes(q));

    // Determine which root entry types are readable
    const readableRootTypes = useMemo(
        () =>
            Object.keys(adminConfig.entries).filter((type) =>
                hasPermission(`entry:${type}:read`)
            ),
        [hasPermission]
    );

    // Determine which plugin entry types are readable per plugin
    const readablePluginTypes = useMemo(
        () =>
            adminConfig.plugins
                .map((plugin) => ({
                    namespace: plugin.namespace,
                    permissionNamespace: plugin.permissionNamespace,
                    entries: plugin.entries,
                    types: Object.keys(plugin.entries).filter((type) =>
                        hasPermission(
                            `plugin:${plugin.permissionNamespace}:entry:${type}:read`
                        )
                    ),
                }))
                .filter((p) => p.types.length > 0),
        [hasPermission]
    );

    const liveQuery = useQuery({
        queryKey: ['cmdpal-search', debouncedQuery] as const,
        enabled: debouncedQuery !== '',
        staleTime: 0,
        queryFn: async (): Promise<LiveResults> => {
            const q2 = debouncedQuery;

            const rootEntriesPromise: Promise<Entry[]> =
                readableRootTypes.length > 0
                    ? astromechClient.entries
                          .query({ type: readableRootTypes, search: q2, limit: 5 })
                          .then((r) => r.data)
                          .catch(() => [])
                    : Promise.resolve([]);

            const pluginEntriesPromises: Promise<Entry[]>[] = readablePluginTypes.map(
                (p) => {
                    const pluginNs = astromechClient.plugins;
                    if (!pluginNs) return Promise.resolve([]);
                    const pluginApi = pluginNs[p.namespace] as
                        | { entries: typeof astromechClient.entries }
                        | undefined;
                    if (!pluginApi) return Promise.resolve([]);
                    return pluginApi.entries
                        .query({ type: p.types, search: q2, limit: 5 })
                        .then((r) => r.data)
                        .catch(() => []);
                }
            );

            const usersPromise: Promise<User[]> = canReadUsers()
                ? astromechClient.users
                      .query({ search: q2, limit: 5 })
                      .then((r) => r.data)
                      .catch(() => [])
                : Promise.resolve([]);

            const mediaPromise: Promise<Media[]> = canReadMedia()
                ? astromechClient.media
                      .query({ search: q2, limit: 5 })
                      .then((r) => r.data)
                      .catch(() => [])
                : Promise.resolve([]);

            const [rootEntries, pluginEntryChunks, users, media] = await Promise.all([
                rootEntriesPromise,
                Promise.all(pluginEntriesPromises),
                usersPromise,
                mediaPromise,
            ]);

            // Flatten plugin entries, tag with plugin name for link building
            const taggedPluginEntries: Entry[] = pluginEntryChunks.flat();

            return {
                entries: [...(rootEntries ?? []), ...taggedPluginEntries],
                users,
                media,
            };
        },
    });

    // Map live entries to CommandItems
    const liveEntryItems: LiveCommandItem[] = useMemo(() => {
        if (!liveQuery.data) return [];
        return liveQuery.data.entries.map((entry) => {
            // Resolve the entry's type config. Root entries use a bare type id
            // (keyed directly in `adminConfig.entries`). Plugin entries arrive
            // with a qualified id (`{plugin}/{type}`) but `plugin.entries` is
            // keyed by the BARE type — so parse the id before looking it up.
            let entryType: AdminEntryType | undefined =
                typeof entry.type === 'string'
                    ? adminConfig.entries[entry.type]
                    : undefined;
            if (entryType === undefined && typeof entry.type === 'string') {
                const parsed = parseEntryTypeId(entry.type);
                if (parsed) {
                    const plugin = adminConfig.plugins.find(
                        (p) => p.namespace === parsed.plugin
                    );
                    const pluginEntryType = plugin?.entries[parsed.type];
                    if (plugin && pluginEntryType) {
                        entryType = pluginEntryType;
                    }
                }
            }
            const label = entryLabel(entry, entryType);
            const iconName = entryType?.icon;
            const to = entryAdminPath(
                typeof entry.type === 'string' ? entry.type : '',
                entry.id
            );
            return {
                kind: 'live' as const,
                id: `live-entry-${entry.id}-${entry.type}`,
                label,
                to,
                group: 'LiveEntries' as const,
                typeId: typeof entry.type === 'string' ? entry.type : '',
                ...(entryType?.plural !== undefined
                    ? { typeLabel: entryType.plural }
                    : {}),
                Icon: () => <EntryTypeIcon name={iconName} size={15} />,
            };
        });
    }, [liveQuery.data]);

    const liveUserItems: LiveCommandItem[] = useMemo(() => {
        if (!liveQuery.data) return [];
        return liveQuery.data.users.map((user) => ({
            kind: 'live' as const,
            id: `live-user-${user.id}`,
            label: user.name,
            sublabel: user.email,
            to: `/users/${user.id}`,
            group: 'LiveUsers' as const,
            Icon: () => <Users size={15} />,
        }));
    }, [liveQuery.data]);

    const liveMediaItems: LiveCommandItem[] = useMemo(() => {
        if (!liveQuery.data) return [];
        return liveQuery.data.media.map((m): LiveCommandItem => {
            const label = m.alt ?? m.filename;
            const showSub = m.filename !== label;
            return {
                kind: 'live',
                id: `live-media-${m.id}`,
                label,
                ...(showSub ? { sublabel: m.filename } : {}),
                to: '/media',
                search: { item: m.id },
                group: 'LiveMedia',
                Icon: () => <Image size={15} />,
            };
        });
    }, [liveQuery.data]);

    type GroupDef = {
        label: string;
        items: CommandItem[];
    };

    const groups: GroupDef[] = useMemo(() => {
        const result: GroupDef[] = [];
        const staticNavMatches = filteredStatic.filter((i) => i.group === 'Navigation');
        const staticEntryTypeMatches = filteredStatic.filter(
            (i) => i.group === 'EntryTypes'
        );
        const staticPageMatches = filteredStatic.filter((i) => i.group === 'Pages');

        if (staticNavMatches.length > 0) {
            result.push({ label: t('cmdpal.groupNavigation'), items: staticNavMatches });
        }
        if (staticEntryTypeMatches.length > 0) {
            result.push({
                label: t('cmdpal.groupEntries'),
                items: staticEntryTypeMatches,
            });
        }
        if (staticPageMatches.length > 0) {
            result.push({ label: t('cmdpal.groupPages'), items: staticPageMatches });
        }

        // Live groups only shown when query is non-empty
        if (debouncedQuery !== '') {
            // Split entry results into one group per entry type, in first-seen
            // order, so each result reads as e.g. "Pages" / "Posts" / "Redirects"
            // rather than a single undifferentiated "Records" list.
            if (liveEntryItems.length > 0) {
                const byType = new Map<string, LiveCommandItem[]>();
                for (const item of liveEntryItems) {
                    const key = item.typeId ?? '';
                    const bucket = byType.get(key);
                    if (bucket) bucket.push(item);
                    else byType.set(key, [item]);
                }
                for (const items of byType.values()) {
                    result.push({
                        label: items[0]?.typeLabel ?? t('cmdpal.groupRecords'),
                        items,
                    });
                }
            }
            if (liveUserItems.length > 0) {
                result.push({ label: t('cmdpal.groupUsers'), items: liveUserItems });
            }
            if (liveMediaItems.length > 0) {
                result.push({ label: t('cmdpal.groupMedia'), items: liveMediaItems });
            }
        }

        return result;
    }, [
        filteredStatic,
        liveEntryItems,
        liveUserItems,
        liveMediaItems,
        debouncedQuery,
        t,
    ]);

    // Flat list for keyboard navigation
    const flatItems: CommandItem[] = useMemo(
        () => groups.flatMap((g) => g.items),
        [groups]
    );

    // Reset state when palette opens
    useEffect(() => {
        if (open) {
            setQuery('');
            setActiveIndex(0);
            requestAnimationFrame(() => {
                inputRef.current?.focus();
            });
        }
    }, [open]);

    // Keep active index in bounds when results change
    useEffect(() => {
        setActiveIndex((prev) =>
            flatItems.length === 0 ? 0 : Math.min(prev, flatItems.length - 1)
        );
    }, [flatItems.length]);

    // Reset active index when the debounced query changes so stale position
    // from a previous result set doesn't carry over to the new one
    useEffect(() => {
        setActiveIndex(0);
    }, [debouncedQuery]);

    const activate = useCallback(
        (item: CommandItem) => {
            setOpen(false);
            const search = item.kind === 'live' ? item.search : undefined;
            void navigate({ to: item.to, ...(search ? { search } : {}) });
        },
        [navigate, setOpen]
    );

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((prev) => (prev + 1) % Math.max(flatItems.length, 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(
                (prev) =>
                    (prev - 1 + Math.max(flatItems.length, 1)) %
                    Math.max(flatItems.length, 1)
            );
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const item = flatItems[activeIndex];
            if (item !== undefined) {
                activate(item);
            }
        }
    }

    // Flat index helper for group+item coords
    const flatIndex = (groupIdx: number, itemIdx: number): number => {
        let offset = 0;
        for (let g = 0; g < groupIdx; g++) {
            offset += groups[g]?.items.length ?? 0;
        }
        return offset + itemIdx;
    };

    const isSearching = query.trim() !== '' && liveQuery.isFetching;
    const hasNoResults = flatItems.length === 0 && !isSearching;

    return (
        <Dialog.Root
            open={open}
            onOpenChange={(o) => {
                if (!o) setOpen(false);
            }}
        >
            <Dialog.Portal>
                <Dialog.Backdrop className="am-modal-backdrop" />
                <Dialog.Popup
                    className="am-modal-panel am-cmdpal"
                    onKeyDown={handleKeyDown}
                    aria-label={t('cmdpal.ariaLabel')}
                >
                    <div className="am-cmdpal-input-wrap">
                        <input
                            ref={inputRef}
                            type="text"
                            className="am-cmdpal-input"
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

                    <div
                        className="am-cmdpal-results"
                        role="listbox"
                        aria-label={t('cmdpal.resultsLabel')}
                    >
                        {isSearching && (
                            <div className="am-cmdpal-empty">{t('cmdpal.searching')}</div>
                        )}
                        {!isSearching && hasNoResults && (
                            <div className="am-cmdpal-empty">{t('cmdpal.noResults')}</div>
                        )}
                        {!isSearching &&
                            groups.map((group, groupIdx) => (
                                <div
                                    key={`${groupIdx}-${group.label}`}
                                    className="am-cmdpal-group"
                                >
                                    <div className="am-cmdpal-group-heading">
                                        {group.label}
                                    </div>
                                    {group.items.map((item, itemIdx) => {
                                        const idx = flatIndex(groupIdx, itemIdx);
                                        const isActive = idx === activeIndex;
                                        const { Icon } = item;
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                role="option"
                                                aria-selected={isActive}
                                                className={
                                                    isActive
                                                        ? 'am-cmdpal-item am-cmdpal-item-active'
                                                        : 'am-cmdpal-item'
                                                }
                                                onMouseEnter={() => setActiveIndex(idx)}
                                                onClick={() => activate(item)}
                                            >
                                                <span className="am-cmdpal-item-icon">
                                                    <Icon />
                                                </span>
                                                <span className="am-cmdpal-item-label">
                                                    {item.label}
                                                    {item.kind === 'live' &&
                                                        item.sublabel !== undefined && (
                                                            <span className="am-cmdpal-item-sublabel">
                                                                {item.sublabel}
                                                            </span>
                                                        )}
                                                </span>
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
