import type { AdminResource } from '@/types/index';

/**
 * Define an admin resource for a plugin's `admin.resources`: list, create and
 * edit screens over the plugin's own service methods.
 */
export function defineAdminResource(resource: AdminResource): AdminResource {
    return resource;
}
