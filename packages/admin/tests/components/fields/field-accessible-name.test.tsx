/**
 * @vitest-environment happy-dom
 *
 * Every field type takes its accessible name from its label: a field with one
 * control names that control, and a field with several names the group that
 * holds them, and a required field's control is marked required while its
 * name leaves out the asterisk. This walks the registry rather than checking
 * one field.
 */

import type { DataField } from '@/types/index';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CORE_FIELD_TYPES } from '@/types/index';
import '@/admin/rendering/register-fields';
import { FormField } from '@/admin/components/fields/form-field';
import { getFieldComponent } from '@/admin/rendering/field-registry';

const LABEL = 'Headline';

/** A sub-field for the container types, which render nothing without one. */
const INNER: DataField = { name: 'inner', type: 'text', label: 'Inner' };

/**
 * One row per registered field type: the field, a value it renders, and the
 * role of the element its label names. A date input has no ARIA role.
 */
const CASES: {
    field: Omit<DataField, 'name' | 'label'>;
    value: unknown;
    role: string | undefined;
    name?: string;
}[] = [
    { field: { type: 'text' }, value: '', role: 'textbox' },
    { field: { type: 'textarea' }, value: '', role: 'textbox' },
    { field: { type: 'richtext' }, value: null, role: 'textbox' },
    { field: { type: 'number' }, value: null, role: 'spinbutton' },
    { field: { type: 'boolean' }, value: false, role: 'switch' },
    { field: { type: 'date' }, value: '', role: undefined },
    { field: { type: 'datetime' }, value: '', role: undefined },
    { field: { type: 'select', options: ['a', 'b'] }, value: 'a', role: 'combobox' },
    { field: { type: 'multiselect', options: ['a', 'b'] }, value: [], role: 'combobox' },
    { field: { type: 'media' }, value: null, role: 'group' },
    // No `target`, so the field asks the server for nothing.
    { field: { type: 'relationship' }, value: null, role: 'combobox' },
    { field: { type: 'json' }, value: null, role: 'textbox' },
    { field: { type: 'repeater', fields: [INNER] }, value: [], role: 'group' },
    { field: { type: 'email' }, value: '', role: 'textbox' },
    { field: { type: 'url' }, value: '', role: 'textbox' },
    // The trigger reads its colour after the label.
    {
        field: { type: 'color' },
        value: '#000000',
        role: 'button',
        name: `${LABEL} #000000`,
    },
    { field: { type: 'slug' }, value: '', role: 'textbox' },
    { field: { type: 'group', fields: [INNER] }, value: {}, role: 'group' },
    { field: { type: 'range', min: 0, max: 10 }, value: 5, role: 'slider' },
    { field: { type: 'checkbox-group', options: ['a', 'b'] }, value: [], role: 'group' },
    {
        field: { type: 'radio-group', options: ['a', 'b'] },
        value: 'a',
        role: 'radiogroup',
    },
    { field: { type: 'link' }, value: null, role: 'group' },
    { field: { type: 'key-value' }, value: {}, role: 'group' },
    { field: { type: 'blocks', blocks: [] }, value: [], role: 'group' },
    { field: { type: 'tree', fields: [INNER] }, value: [], role: 'group' },
];

describe('field accessible names', () => {
    it('has a case for every field type the admin registers a component for', () => {
        expect(CASES.map((c) => c.field.type).sort()).toEqual(
            CORE_FIELD_TYPES.filter(
                (type) => getFieldComponent(type) !== undefined
            ).sort()
        );
    });

    it.each(CASES)(
        'names the $field.type field’s $role by its label',
        ({ field, value, role, name = LABEL }) => {
            const { container } = render(
                <FormField
                    field={{ ...field, name: 'f', label: LABEL }}
                    value={value}
                    onChange={() => undefined}
                />
            );

            const named = screen.getByLabelText(LABEL);
            if (role === undefined) {
                expect(named).toBe(container.querySelector('input[name="f"]'));
            } else {
                expect(screen.getByRole(role, { name })).toBe(named);
            }
        }
    );

    it('names a nested range field by its label, not by its path', () => {
        const { container } = render(
            <FormField
                field={{ name: 'level', type: 'range', min: 0, max: 10 }}
                name="blocks[b1].level"
                value={5}
                onChange={() => undefined}
            />
        );

        const label = container.querySelector('.am-field-label')?.textContent ?? '';
        expect(label).not.toContain('blocks');
        expect(screen.getByRole('slider', { name: label })).toBeTruthy();
    });

    it.each(CASES.filter(({ role }) => role === undefined || REQUIRABLE.has(role)))(
        'marks the required $field.type field’s $role required, out of its name',
        ({ field, value, role, name = LABEL }) => {
            const { container } = render(
                <FormField
                    field={{ ...field, name: 'f', label: LABEL, required: true }}
                    value={value}
                    onChange={() => undefined}
                />
            );

            // A role's name is the accessible name, which leaves out the
            // hidden asterisk; a date input has no role to look it up by.
            const named =
                role === undefined
                    ? container.querySelector('input[name="f"]')
                    : screen.getByRole(role, { name });
            expect(
                named?.hasAttribute('required') === true ||
                    named?.getAttribute('aria-required') === 'true'
            ).toBe(true);
        }
    );
});

/** The roles that take `aria-required`; a group, a button or a slider does not. */
const REQUIRABLE = new Set(['textbox', 'spinbutton', 'switch', 'combobox', 'radiogroup']);
