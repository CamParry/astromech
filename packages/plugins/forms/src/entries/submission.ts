/**
 * The `submission` entry type — managed through the standard entry UI, no
 * custom admin surface. Storage is the plugin's own table via `tableStorage`
 * (no core capabilities), so records carry
 * `fields = { formId, formSlug, data, summary, meta, submittedAt }`.
 *
 * Submissions are never hand-authored — they're written by the public
 * `submit` service method. v1 has no read-only-entry flag in core, so this
 * relies on permissions instead: a site grants read + delete on
 * `forms/submission` and withholds create + update.
 */

import type { EntryTypeConfig } from 'astromech';
import { tableStorage } from 'astromech';
import { submissionsTable } from '../tables/submissions.js';
import { SUBMISSION_TYPE } from '../types.js';
import * as fields from 'astromech/fields';
import * as columns from 'astromech/columns';

export const submissionEntryType: EntryTypeConfig = {
    type: SUBMISSION_TYPE,
    single: 'Submission',
    plural: 'Submissions',
    storage: tableStorage(submissionsTable),
    titleField: false,
    statuses: false,
    slug: false,
    trash: false,
    adminColumns: [
        columns.text('formSlug', { label: 'Form' }),
        columns.text('summary', { label: 'Summary' }),
        columns.date('submittedAt', { label: 'Submitted' }),
    ],
    fields: [
        fields.text('formId', {
            label: 'Form ID',
            required: true,
            description: 'Written by the submit API — not hand-editable.',
        }),
        fields.text('formSlug', {
            label: 'Form',
            required: true,
            description: 'Written by the submit API — not hand-editable.',
        }),
        fields.json('data', {
            label: 'Submitted data',
            required: true,
            description: 'Written by the submit API — not hand-editable.',
        }),
        fields.text('summary', {
            label: 'Summary',
            description: 'Written by the submit API — not hand-editable.',
        }),
        fields.json('meta', {
            label: 'Meta',
            description: 'Written by the submit API — not hand-editable.',
        }),
        fields.datetime('submittedAt', {
            label: 'Submitted at',
            required: true,
            description: 'Written by the submit API — not hand-editable.',
        }),
    ],
};
