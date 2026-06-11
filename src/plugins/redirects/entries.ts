/**
 * The `redirect` entry type — redirects are first-class entries managed
 * through the standard entry UI, no custom admin surface.
 *
 * Storage is the plugin's own `plugin_redirects_redirects` table via
 * `tableStorage` (supports: []), so every core capability is disabled:
 * titleless, no statuses, no slug, no trash, no versioning, no translation.
 * Records carry `fields = { from, to, status, enabled }`.
 */

import type { EntryTypeConfig } from '@/types/index.js';
import { tableStorage } from '@/core/entry-storage/table.js';
import { redirectsTable } from '@/plugins/redirects/schema.js';

export const redirectEntryType: EntryTypeConfig = {
    single: 'Redirect',
    plural: 'Redirects',
    storage: tableStorage(redirectsTable),
    titleField: false,
    statuses: false,
    slug: false,
    trash: false,
    search: ['from', 'to'],
    adminColumns: [
        { field: 'from', label: 'From' },
        { field: 'to', label: 'To' },
        { field: 'status', label: 'Status' },
        { field: 'enabled', label: 'Enabled' },
    ],
    fieldGroups: [
        {
            name: 'redirect',
            label: 'Redirect',
            placement: 'main',
            priority: 0,
            fields: [
                {
                    name: 'from',
                    type: 'text',
                    label: 'From path',
                    required: true,
                },
                {
                    name: 'to',
                    type: 'text',
                    label: 'To path',
                    required: true,
                },
                {
                    name: 'status',
                    type: 'select',
                    label: 'Type',
                    defaultValue: '301',
                    options: [
                        { value: '301', label: 'Permanent (301)' },
                        { value: '302', label: 'Temporary (302)' },
                    ],
                },
                {
                    name: 'enabled',
                    type: 'boolean',
                    label: 'Enabled',
                    defaultValue: true,
                    checkboxLabel: 'This redirect is active',
                },
            ],
        },
    ],
};
