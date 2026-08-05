/**
 * The permissions this plugin makes grantable. Bare keys; core namespaces them
 * to `plugin:assistant:{key}`. A site enumerates the ones it grants:
 *
 *   roles: { editor: { permissions: [...assistant.permissions('use')] } }
 */

import { definePermissions } from 'astromech';

export const assistantPermissions = definePermissions({
    use: {
        label: 'Use the assistant',
        description:
            'Open the assistant and run it against the content this role can already reach.',
    },
});
