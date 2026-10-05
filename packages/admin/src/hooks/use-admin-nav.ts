/**
 * The admin's navigation as the signed-in user may use it, read by both the
 * sidebar and the command palette so the two list the same pages. Each section
 * holds only what the user's permissions let them open.
 */

import type { PluginNavItem } from 'astromech';
import type { TFunction } from 'i18next';
import type { LucideIcon } from 'lucide-react';
import { globalPermission, hasPermission } from 'astromech/shared';
import {
    Database,
    Globe,
    Image,
    LayoutDashboard,
    Puzzle,
    ShieldCheck,
    Users,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { useAuth } from '../context/auth';
import { resolveLabel } from '../i18n/labels';
import { resolveIcon } from '../utilities/admin-icon';

/** One page link in the admin's navigation. */
export type AdminNavLink = {
    to: string;
    label: string;
    Icon: LucideIcon;
};

/** One plugin's nav tree, with the items the user lacks permission for removed. */
type AdminNavPlugin = {
    label: string;
    items: PluginNavItem[];
};

/** The sidebar's sections, in the order it renders them. */
export type AdminNav = {
    /** The dashboard, and media when the user may read it. */
    primary: AdminNavLink[];
    entryTypes: AdminNavLink[];
    globals: AdminNavLink[];
    /** The site's own admin pages. */
    pages: AdminNavLink[];
    plugins: AdminNavPlugin[];
    /** Users, when the user may read them, and Security, when they may manage it. */
    system: AdminNavLink[];
};

/** The nav sections the signed-in user may open, rebuilt only when the user or language changes. */
export function useAdminNav(): AdminNav {
    const { t } = useTranslation();
    const { user } = useAuth();
    return useMemo(() => buildAdminNav(user?.permissions ?? [], t), [user, t]);
}

function buildAdminNav(permissions: string[], t: TFunction): AdminNav {
    const allowed = (permission: string): boolean =>
        hasPermission(permissions, permission);

    const primary: AdminNavLink[] = [
        { to: '/', label: t('nav.dashboard'), Icon: LayoutDashboard },
        ...(allowed('media:read')
            ? [{ to: '/media', label: t('nav.media'), Icon: Image }]
            : []),
    ];
    // The site's own types and globals; a plugin's appear in that plugin's
    // nav tree instead. Each global is gated on its own read permission.
    const entryTypes = Object.entries(adminConfig.entryTypes)
        .filter(([, entryType]) => entryType.plugin === undefined)
        .map(([key, entryType]) => ({
            to: `/entries/${key}`,
            label: entryType.plural,
            Icon: resolveIcon(entryType.icon, Database),
        }));
    const globals = Object.entries(adminConfig.globals)
        .filter(
            ([key, global]) =>
                global.plugin === undefined &&
                global.nav &&
                allowed(globalPermission(key, 'read'))
        )
        .map(([key, global]) => ({
            to: `/globals/${key}`,
            label: resolveLabel(global.label, key, t, 'translation'),
            Icon: resolveIcon(global.icon, Globe),
        }));
    // Each page carries its own resolved permission, so the section gates per page.
    const pages = (adminConfig.pages ?? [])
        .filter(
            (page) =>
                page.nav !== false &&
                (page.permission === null || allowed(page.permission))
        )
        .map((page) => ({
            to: `/page/${page.path}`,
            label: resolveLabel(page.label, page.path, t, 'translation'),
            Icon: resolveIcon(page.icon, Puzzle),
        }));
    const plugins = adminConfig.plugins
        .map((plugin) => ({
            label: plugin.label,
            items: filterNavItems(plugin.nav, allowed),
        }))
        .filter((plugin) => plugin.items.length > 0);
    const system: AdminNavLink[] = [
        ...(allowed('users:read')
            ? [{ to: '/users', label: t('nav.users'), Icon: Users }]
            : []),
        ...(allowed('security:manage')
            ? [{ to: '/security', label: t('nav.security'), Icon: ShieldCheck }]
            : []),
    ];

    return { primary, entryTypes, globals, pages, plugins, system };
}

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
