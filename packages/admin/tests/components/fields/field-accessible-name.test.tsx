/**
 * @vitest-environment happy-dom
 *
 * Every field type takes its accessible name from its label: a field with one
 * control names that control, and a field with several names the group that
 * holds them. This walks the registry rather than checking one field.
 */

import type { DataField } from '@/types/index';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CORE_FIELD_TYPES } from '@/types/index';
import '@/admin/rendering/register-fields';
import { FormField } from '@/admin/components/fields/form-field';

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
    it('has a case for every registered field type', () => {
        const layout = new Set(['accordion', 'tab', 'tabs']);
        expect(CASES.map((c) => c.field.type).sort()).toEqual(
            CORE_FIELD_TYPES.filter((type) => !layout.has(type)).sort()
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
});
