/**
 * The `redirect` entry type — redirects are first-class entries managed
 * through the standard entry UI, no custom admin surface.
 *
 * Authored via field builders + flat `fields` (Phase 5 slice 4 veneer).
 * Storage is the plugin's own `plugin_redirects_redirects` table via
 * `tableStorage` (supports: []), so every core capability is disabled:
 * titleless, no statuses, no slug, no trash, no versioning, no translation.
 * Records carry `fields = { from, to, status, enabled }`.
 * `search` is derived automatically from `.searchable()` fields.
 */

import type { EntryTypeConfig } from '@/types/index.js';
import { tableStorage } from '@/core/entry-storage/table.js';
import { redirectsTable } from '@/plugins/redirects/schema.js';
import { text, select, boolean } from '@/index.js';

export const redirectEntryType: EntryTypeConfig = {
    single: 'Redirect',
    plural: 'Redirects',
    storage: tableStorage(redirectsTable),
    titleField: false,
    statuses: false,
    slug: false,
    trash: false,
    adminColumns: [
        { field: 'from', label: 'From' },
        { field: 'to', label: 'To' },
        { field: 'status', label: 'Status' },
        { field: 'enabled', label: 'Enabled' },
    ],
    fields: [
        text('from').label('From path').required().searchable(),
        text('to').label('To path').required().searchable(),
        select('status', [
            { value: '301', label: 'Permanent (301)' },
            { value: '302', label: 'Temporary (302)' },
        ])
            .label('Type')
            .default('301'),
        boolean('enabled')
            .checkboxLabel('This redirect is active')
            .label('Enabled')
            .default(true),
    ],
};
