/**
 * The field definitions of a redirect rule: what the admin form renders and
 * what the service's `create` and `update` check their input against.
 */

import type { Field } from 'astromech';
import * as fields from 'astromech/fields';

export const redirectFields: Field[] = [
    fields.text('from', {
        label: 'From',
        description: 'The request path to redirect, such as /old-page.',
        required: true,
        validation: [{ unique: true }],
    }),
    fields.text('to', {
        label: 'To',
        description: 'The path or URL to send the visitor to.',
        required: true,
    }),
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
        description: 'A disabled rule is kept but not followed.',
        defaultValue: true,
    }),
];
