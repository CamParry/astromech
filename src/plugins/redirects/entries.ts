/**
 * The `redirect` entry type — redirects are first-class entries managed
 * through the standard entry UI, no custom admin surface.
 *
 * Authored via field factories + flat `fields` (Phase 5 slice 4 veneer).
 * Storage is the plugin's own `plugin_redirects_redirects` table via
 * `tableStorage` (supports: []), so every core capability is disabled:
 * titleless, no statuses, no slug, no trash, no versioning, no translation.
 * Records carry `fields = { from, to, status, enabled }`.
 * `search` is derived automatically from `searchable` fields.
 */

import type { EntryTypeConfig } from '@/types/index.js';
import { tableStorage } from '@/core/entry-storage/table.js';
import { redirectsTable } from '@/plugins/redirects/schema.js';
import * as fields from '@/builders/fields.js';
import * as columns from '@/builders/columns.js';

export const redirectEntryType: EntryTypeConfig = {
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
