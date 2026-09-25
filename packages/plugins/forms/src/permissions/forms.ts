/**
 * The permissions this plugin makes grantable, over stored submissions. Bare
 * keys; core namespaces them to `plugin:forms:{key}`. Submitting needs none.
 */

import { definePermissions } from 'astromech';

export const formsPermissions = definePermissions({
    read: {
        label: 'View form submissions',
        description:
            'List and open stored form submissions, including what was submitted.',
    },
    delete: {
        label: 'Delete form submissions',
        description: 'Permanently delete stored form submissions.',
    },
});
