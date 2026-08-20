import type { AdminPage } from '@/types/index';

/**
 * Define an admin page for use in `admin.pages` (host app and plugins). A
 * page is a `component` view or a `fields` settings form; exactly one of the
 * two must be provided, validated crash-loud at config resolution.
 */
export function defineAdminPage(page: AdminPage): AdminPage {
    return page;
}
