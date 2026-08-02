/**
 * Table descriptor for submissions. `definePluginTable` adds the
 * `plugin_<namespace>_` prefix, so this declares the bare name.
 */

import { definePluginTable } from 'astromech';
import type { TableInsert, TableSelect } from 'astromech';
import { FORMS_PACKAGE } from '../types.js';
import type { SubmissionMeta } from '../types.js';

export const submissionsTable = definePluginTable(
    FORMS_PACKAGE,
    'submissions',
    ({ col }) => ({
        id: col.id(),
        formId: col.text({ notNull: true }),
        formSlug: col.text({ notNull: true }),
        data: col.json<Record<string, unknown>>({ notNull: true }),
        // A readable rendering of `data` for the list column, computed at
        // submit time — no cell kind can summarise a JSON blob.
        summary: col.text(),
        meta: col.json<SubmissionMeta>(),
        submittedAt: col.timestamp({ notNull: true, defaultNow: true }),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
    }),
    ({ index }) => [index('idx_form_id', ['formId'])]
);

export type SubmissionRow = TableSelect<typeof submissionsTable>;
export type NewSubmissionRow = TableInsert<typeof submissionsTable>;
