import type { AdminPage } from '@/types/index';

/**
 * Define an admin page for use in `admin.pages` (host app and plugins). A page
 * renders a React component; a field-bearing destination is a global.
 */
export function defineAdminPage(page: AdminPage): AdminPage {
    return page;
}
