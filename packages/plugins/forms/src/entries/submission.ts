/**
 * The `submission` entry type, stored in the plugin's own table via
 * `tableStorage`. Rows are written by the public `submit` method, never by
 * hand; a site withholds create and update permission to keep it that way.
 */

import type { EntryType } from 'astromech';
import { tableStorage } from 'astromech';
import * as columns from 'astromech/columns';
import * as fields from 'astromech/fields';
import { submissionsTable } from '../tables/submissions';
import { SUBMISSION_TYPE } from '../types';

export const submissionEntryType: EntryType = {
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
