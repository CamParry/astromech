/**
 * The permissions this plugin makes grantable. Bare keys; core namespaces them
 * to `plugin:redirects:{key}`. A site grants them with `redirects.permissions('read', …)`.
 */

import { definePermissions } from 'astromech';

export const redirectsPermissions = definePermissions({
    read: { label: 'View redirects', description: 'List and open redirect rules.' },
    create: { label: 'Create redirects', description: 'Add redirect rules.' },
    update: { label: 'Edit redirects', description: 'Change redirect rules.' },
    delete: { label: 'Delete redirects', description: 'Remove redirect rules.' },
});
