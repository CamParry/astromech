/**
 * The `redirect` entry type — managed through the standard entry UI, no custom
 * admin surface. Storage is the plugin's own table via `tableStorage` (no core
 * capabilities), so records carry `fields = { from, to, status, enabled }` and
 * `search` is derived from `searchable` fields.
 */

import type { EntryTypeConfig } from '@/types/index.js';
import { tableStorage } from '@/entries/storage/table.js';
import { redirectsTable } from '../schema/redirects.js';
import { REDIRECT_TYPE } from '../types.js';
import * as fields from '@/fields/index.js';
import * as columns from '@/fields/columns.js';

export const redirectEntryType: EntryTypeConfig = {
    type: REDIRECT_TYPE,
    single: 'Redirect',
    plural: 'Redirects',
    storage: tableStorage(redirectsTable),
    titleField: false,
    statuses: false,
    slug: false,
    trash: false,
    adminColumns: [
        columns.text('from', { label: 'From' }),
        columns.text('to', { label: 'To' }),
        columns.badge('status', { label: 'Status' }),
        columns.boolean('enabled', { label: 'Enabled' }),
    ],
    fields: [
        fields.text('from', { label: 'From path', required: true, searchable: true }),
        fields.text('to', { label: 'To path', required: true, searchable: true }),
        fields.select('status', {
            label: 'Type',
            defaultValue: '301',
            options: [
                { value: '301', label: 'Permanent (301)' },
                { value: '302', label: 'Temporary (302)' },
            ],
        }),
        fields.boolean('enabled', {
            label: 'Enabled',
            defaultValue: true,
        }),
    ],
};
