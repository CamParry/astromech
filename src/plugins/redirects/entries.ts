/**
 * The `redirect` entry type — redirects are first-class entries managed
 * through the standard entry UI, no custom admin surface.
 */

import type { EntryTypeConfig } from '@/types/index.js';

export const redirectEntryType: EntryTypeConfig = {
    single: 'Redirect',
    plural: 'Redirects',
    adminColumns: [
        { field: 'from', label: 'From' },
        { field: 'to', label: 'To' },
        { field: 'status', label: 'Status' },
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
