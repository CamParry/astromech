/**
 * Unit tests for the forms plugin's block → `Field` compiler.
 *
 * `@astromech/forms` has no test setup of its own (unlike `redirects`/
 * `menus`/`backups`, which are aliased for the astromech vitest instance) and
 * no `@astromech/forms` alias exists yet, so this file imports the compiler
 * by relative path and lives here — under `packages/astromech/tests/` — so
 * `npm run test` (which runs the astromech workspace's vitest) picks it up.
 */

import { describe, expect, it } from 'vitest';
import { processFields } from '@/fields/pipeline.js';
import { compileFormFields } from '../../../../plugins/forms/src/fields/compile.js';

describe('compileFormFields', () => {
    it('compiles a text block', () => {
        const [field] = compileFormFields([
            { _type: 'text', name: 'firstName', label: 'First name', required: true },
        ]);
        expect(field).toMatchObject({ name: 'firstName', type: 'text', required: true });
    });

    it('compiles a textarea block with min/max length rules', () => {
        const [field] = compileFormFields([
            {
                _type: 'textarea',
                name: 'message',
                label: 'Message',
                minLength: 10,
                maxLength: 500,
            },
        ]);
        expect(field?.type).toBe('textarea');
        expect(field?.validation).toEqual([{ minLength: 10 }, { maxLength: 500 }]);
    });

    it('compiles an email block', () => {
        const [field] = compileFormFields([
            { _type: 'email', name: 'email', label: 'Email' },
        ]);
        expect(field?.type).toBe('email');
    });

    it('compiles a tel block to fields.text', () => {
        const [field] = compileFormFields([
            { _type: 'tel', name: 'phone', label: 'Phone' },
        ]);
        expect(field?.type).toBe('text');
        expect(field?.name).toBe('phone');
    });

    it('compiles a url block', () => {
        const [field] = compileFormFields([
            { _type: 'url', name: 'website', label: 'Website' },
        ]);
        expect(field?.type).toBe('url');
    });

    it('compiles a number block with min/max rules', () => {
        const [field] = compileFormFields([
            { _type: 'number', name: 'age', label: 'Age', min: 18, max: 99 },
        ]);
        expect(field?.type).toBe('number');
        expect(field?.validation).toEqual([{ min: 18 }, { max: 99 }]);
    });

    it('compiles a date block', () => {
        const [field] = compileFormFields([
            { _type: 'date', name: 'dob', label: 'Date of birth' },
        ]);
        expect(field?.type).toBe('date');
    });

    it('compiles a checkbox block to fields.boolean', () => {
        const [field] = compileFormFields([
            { _type: 'checkbox', name: 'consent', label: 'I agree' },
        ]);
        expect(field?.type).toBe('boolean');
    });

    it('compiles a hidden block to fields.text with its default value', () => {
        const [field] = compileFormFields([
            {
                _type: 'hidden',
                name: 'source',
                label: 'Source',
                defaultValue: 'landing-a',
            },
        ]);
        expect(field?.type).toBe('text');
        expect(field?.defaultValue).toBe('landing-a');
    });

    it('compiles a select block with options and an enum rule', () => {
        const [field] = compileFormFields([
            {
                _type: 'select',
                name: 'plan',
                label: 'Plan',
                options: [
                    { label: 'Free', value: 'free' },
                    { label: 'Pro', value: 'pro' },
                ],
            },
        ]);
        expect(field?.type).toBe('select');
        expect(field?.options).toEqual([
            { value: 'free', label: 'Free' },
            { value: 'pro', label: 'Pro' },
        ]);
        expect(field?.validation).toEqual([{ enum: ['free', 'pro'] }]);
    });

    it('compiles a radio block to fields.radioGroup with an enum rule', () => {
        const [field] = compileFormFields([
            {
                _type: 'radio',
                name: 'size',
                label: 'Size',
                options: [{ label: 'Small', value: 'sm' }],
            },
        ]);
        expect(field?.type).toBe('radio-group');
        expect(field?.validation).toEqual([{ enum: ['sm'] }]);
    });

    it('compiles a checkboxGroup block to fields.multiselect with an enum rule', () => {
        const [field] = compileFormFields([
            {
                _type: 'checkboxGroup',
                name: 'interests',
                label: 'Interests',
                options: [
                    { label: 'Sports', value: 'sports' },
                    { label: 'Music', value: 'music' },
                ],
            },
        ]);
        expect(field?.type).toBe('multiselect');
        expect(field?.validation).toEqual([{ enum: ['sports', 'music'] }]);
    });

    it('omits the enum rule when a choice block has no options', () => {
        const [field] = compileFormFields([
            { _type: 'select', name: 'plan', label: 'Plan' },
        ]);
        expect(field?.validation).toEqual([]);
    });

    it('omits min/max rules when the stored values are not numeric', () => {
        const [field] = compileFormFields([
            {
                _type: 'number',
                name: 'age',
                label: 'Age',
                min: 'eighteen',
                max: undefined,
            },
        ]);
        expect(field?.validation).toEqual([]);
    });

    it('skips a disabled instance', () => {
        const compiled = compileFormFields([
            { _type: 'text', name: 'hidden', label: 'Hidden', _disabled: true },
            { _type: 'text', name: 'visible', label: 'Visible' },
        ]);
        expect(compiled).toHaveLength(1);
        expect(compiled[0]?.name).toBe('visible');
    });

    it('skips an instance with a missing name', () => {
        const compiled = compileFormFields([{ _type: 'text', label: 'No name' }]);
        expect(compiled).toHaveLength(0);
    });

    it('skips an instance with a blank name', () => {
        const compiled = compileFormFields([
            { _type: 'text', name: '', label: 'Blank name' },
        ]);
        expect(compiled).toHaveLength(0);
    });

    // A form saved before the builder enforced its `name` pattern can still hold
    // a name the field-path grammar cannot address. `processFields` throws on one,
    // so compiling it would turn every submission into a 500 — skip it instead.
    it.each(['user.email', 'answers[0]', 'a]b'])(
        'skips an instance whose name breaks the field-path grammar (%s)',
        (name) => {
            const compiled = compileFormFields([
                { _type: 'text', name, label: 'Legacy' },
                { _type: 'text', name: 'user_email', label: 'Valid' },
            ]);
            expect(compiled).toHaveLength(1);
            expect(compiled[0]?.name).toBe('user_email');
        }
    );

    it('a form holding a bad name still validates its remaining fields', async () => {
        const definitions = compileFormFields([
            { _type: 'email', name: 'user.email', label: 'Email', required: true },
            { _type: 'text', name: 'message', label: 'Message', required: true },
        ]);
        const { errors } = await processFields({ message: '' }, definitions, {
            operation: 'create',
            host: { kind: 'entry', record: {} },
            user: null,
            reads: { isUnique: async () => true },
        });
        expect(errors).toEqual({ message: ['This field is required'] });
    });

    it('skips an instance with an unknown _type', () => {
        const compiled = compileFormFields([
            { _type: 'file-upload', name: 'attachment', label: 'Attachment' },
        ]);
        expect(compiled).toHaveLength(0);
    });

    it('returns an empty array for non-array input', () => {
        expect(compileFormFields(undefined)).toEqual([]);
        expect(compileFormFields(null)).toEqual([]);
        expect(compileFormFields('not an array')).toEqual([]);
        expect(compileFormFields({ not: 'an array' })).toEqual([]);
    });
});
