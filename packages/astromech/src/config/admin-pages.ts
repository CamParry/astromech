/**
 * Resolving the host admin pages an author declares under `admin.pages`.
 */

import type { AdminPage, ResolvedAdminPage } from '@/types/index';

/** Resolve a single host admin page to the unified ResolvedAdminPage. */
export function resolveAdminPage(page: AdminPage): ResolvedAdminPage {
    // `componentKey` is the bare path — both the `/page/$` splat and the key of
    // the codegen'd `hostPages` registry.
    return {
        key: page.path,
        path: page.path,
        label: page.label,
        ...(page.icon !== undefined ? { icon: page.icon } : {}),
        componentKey: page.path,
        permission: page.permission ?? null,
        nav: page.nav !== false,
    };
}
