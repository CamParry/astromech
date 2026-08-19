import type { AdminPage } from '@/types/index';

/**
 * Define an admin page for use in `admin.pages` (both host app and plugins).
 * A page is a `component` view or a `fields` settings form, and appears in
 * the sidebar unless it opts out (`nav: false`). Exactly one of `fields` or
 * `component` must be provided; this is validated crash-loud at config
 * resolution.
 */
export function defineAdminPage(page: AdminPage): AdminPage {
    return page;
}
