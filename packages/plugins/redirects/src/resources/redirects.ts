/**
 * The Redirects admin resource: list, create and edit screens over the
 * plugin's own service methods.
 */

import { defineAdminResource } from 'astromech';
import { redirectFields } from '../fields';

export const redirectsResource = defineAdminResource({
    name: 'redirects',
    label: 'Redirects',
    labelSingular: 'Redirect',
    icon: 'Signpost',
    fields: redirectFields,
    columns: [{ field: 'from', sortable: true }, 'to', 'status', 'enabled'],
    search: true,
    methods: {
        list: 'list',
        get: 'get',
        create: 'create',
        update: 'update',
        delete: 'delete',
    },
});
