/**
 * The field definitions a stored submission is displayed through: the admin
 * resource's list columns and its read-only edit screen.
 */

import * as fields from 'astromech/fields';

export const submissionFields = [
    fields.text('formSlug', { label: 'Form' }),
    fields.text('summary', { label: 'Summary' }),
    fields.datetime('submittedAt', { label: 'Submitted' }),
    fields.json('data', { label: 'Submitted data' }),
    fields.json('meta', { label: 'Meta' }),
];
