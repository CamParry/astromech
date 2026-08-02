/**
 * The `form` entry type — core entry storage, standard entry UI, addressed by
 * slug. Its `fields` is one `blocks` field with a block per `FormFieldKind`;
 * `../fields/compile.ts` reads the stored instances back.
 */

import type { EntryTypeConfig, FieldDefinition } from 'astromech';
import { FORM_FIELD_KINDS, FORM_TYPE } from '../types.js';
import * as fields from 'astromech/fields';
import * as columns from 'astromech/columns';

/**
 * The four fields every block starts with. The `name` pattern is enforced
 * because a stored name becomes a compiled field's name at submit time, and
 * error keys use a path grammar that spends `.`, `[` and `]`.
 */
function commonFields(): FieldDefinition[] {
    return [
        fields.text('name', {
            label: 'Name',
            required: true,
            description: 'The key this value is stored under — lowercase, no spaces.',
            validation: [
                {
                    pattern: '^[a-z][a-z0-9_-]*$',
                    message:
                        'Must start with a lowercase letter and use only lowercase letters, numbers, underscores and hyphens.',
                },
            ],
        }),
        fields.text('label', { label: 'Label', required: true }),
        fields.boolean('required', { label: 'Required', defaultValue: false }),
        fields.text('description', { label: 'Help text' }),
    ];
}

/** Choice options for `select`/`radio`/`checkboxGroup` blocks. */
function optionsRepeater(): FieldDefinition {
    return fields.repeater('options', {
        label: 'Options',
        fields: [
            fields.text('label', { label: 'Label', required: true }),
            fields.text('value', { label: 'Value', required: true }),
        ],
    });
}

const MERGE_TAG_MESSAGE =
    'Supports {{fieldName}}, {{formTitle}} and {{submittedAt}} merge tags.';

const BLOCK_LABELS: Record<(typeof FORM_FIELD_KINDS)[number], string> = {
    text: 'Text',
    textarea: 'Text area',
    email: 'Email',
    tel: 'Phone',
    url: 'URL',
    number: 'Number',
    select: 'Select',
    radio: 'Radio group',
    checkbox: 'Checkbox',
    checkboxGroup: 'Checkbox group',
    date: 'Date',
    hidden: 'Hidden',
};

/** The per-kind config fields a block adds on top of `commonFields`. */
function extraFields(kind: (typeof FORM_FIELD_KINDS)[number]): FieldDefinition[] {
    switch (kind) {
        case 'text':
            return [
                fields.text('placeholder', { label: 'Placeholder' }),
                fields.number('minLength', { label: 'Minimum length' }),
                fields.number('maxLength', { label: 'Maximum length' }),
            ];
        case 'textarea':
            return [
                fields.text('placeholder', { label: 'Placeholder' }),
                fields.number('maxLength', { label: 'Maximum length' }),
                fields.number('rows', { label: 'Rows' }),
            ];
        case 'email':
        case 'tel':
        case 'url':
            return [fields.text('placeholder', { label: 'Placeholder' })];
        case 'number':
            return [
                fields.number('min', { label: 'Minimum' }),
                fields.number('max', { label: 'Maximum' }),
            ];
        case 'select':
            return [
                fields.text('placeholder', { label: 'Placeholder' }),
                optionsRepeater(),
            ];
        case 'radio':
        case 'checkboxGroup':
            return [optionsRepeater()];
        case 'checkbox':
        case 'date':
            return [];
        case 'hidden':
            return [fields.text('defaultValue', { label: 'Default value' })];
    }
}

const fieldBlocks = FORM_FIELD_KINDS.map((kind) =>
    fields.block(kind, {
        label: BLOCK_LABELS[kind],
        fields: [...commonFields(), ...extraFields(kind)],
    })
);

export const formEntryType: EntryTypeConfig = {
    type: FORM_TYPE,
    single: 'Form',
    plural: 'Forms',
    // Built-in storage defaults slug on, which is how a form is addressed.
    adminColumns: [
        columns.text('title', { label: 'Title' }),
        columns.slug('slug', { label: 'Slug' }),
        columns.boolean('enabled', { label: 'Enabled' }),
    ],
    fields: [
        fields.tabs({
            fields: [
                fields.tab('fields', {
                    label: 'Fields',
                    fields: [
                        fields.boolean('enabled', {
                            label: 'Accept submissions',
                            defaultValue: true,
                        }),
                        fields.blocks('fields', { label: 'Fields', blocks: fieldBlocks }),
                    ],
                }),
                fields.tab('notifications', {
                    label: 'Notifications',
                    // Every field in this tab must be `private: true` — these
                    // entries are readable through the public entries API.
                    fields: [
                        fields.boolean('notifyEnabled', {
                            label: 'Send notification email',
                            defaultValue: false,
                            private: true,
                        }),
                        fields.repeater('notifyTo', {
                            label: 'Notify recipients',
                            private: true,
                            fields: [
                                fields.email('address', {
                                    label: 'Email',
                                    required: true,
                                }),
                            ],
                        }),
                        fields.text('notifySubject', {
                            label: 'Subject',
                            private: true,
                            description: MERGE_TAG_MESSAGE,
                        }),
                        fields.richtext('notifyBody', {
                            label: 'Body',
                            private: true,
                            description: `${MERGE_TAG_MESSAGE} Leave empty to send the default table of submitted values.`,
                        }),
                        fields.boolean('confirmEnabled', {
                            label: 'Send confirmation email',
                            defaultValue: false,
                            private: true,
                        }),
                        fields.text('confirmSubject', {
                            label: 'Subject',
                            private: true,
                            description: MERGE_TAG_MESSAGE,
                        }),
                        fields.richtext('confirmBody', {
                            label: 'Body',
                            private: true,
                            description: MERGE_TAG_MESSAGE,
                        }),
                        fields.text('confirmToField', {
                            label: 'Send to field',
                            private: true,
                            description:
                                "Name of the field holding the submitter's email address. Empty means the first email field on the form.",
                        }),
                    ],
                }),
                fields.tab('spam', {
                    label: 'Spam',
                    fields: [
                        fields.boolean('spamProtection', {
                            label: 'Spam protection',
                            defaultValue: true,
                            description:
                                'Only applies when the site configures a spam provider.',
                        }),
                    ],
                }),
            ],
        }),
    ],
};
