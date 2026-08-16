/**
 * @vitest-environment happy-dom
 *
 * The controlled leaf fields — the ones that hold no state of their own.
 *
 * Each renders its prop straight into a control and reports every change back
 * through `onChange(name, value)` under the BARE field name. Because they keep
 * no local copy, a value that arrives after the first render shows up on its
 * own — the seeding fact that breaks the stateful containers cannot reach them,
 * and the late-value case in each block is what proves that.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { Field } from '@/types/index';
import '@/admin/rendering/register-fields';
import { FormField } from '@/admin/components/fields/form-field';

afterEach(cleanup);

type Commit = { name: string; value: unknown };

type Mounted = {
    /** Every `onChange` the field has fired, oldest first. */
    commits: Commit[];
    /** Push a new value down, as the default-value copy landing would. */
    rerender: (value: unknown) => void;
    /** The value of the most recent commit. */
    last: () => unknown;
};

/**
 * Mount one leaf `FormField` under a value holder, so a commit feeds straight
 * back into the control the way the entry form's `fields` state does.
 */
function mountField(field: Field, value: unknown): Mounted {
    const commits: Commit[] = [];
    let push!: (value: unknown) => void;

    function Holder(): React.ReactElement {
        const [current, setCurrent] = React.useState(value);
        push = setCurrent;
        return (
            <FormField
                field={field}
                value={current}
                onChange={(name, changed) => {
                    commits.push({ name, value: changed });
                    setCurrent(changed);
                }}
            />
        );
    }

    render(<Holder />);

    return {
        commits,
        rerender: (next) => act(() => push(next)),
        last: () => commits.at(-1)?.value,
    };
}

function control<T extends HTMLElement>(selector: string): T {
    const el = document.querySelector<T>(selector);
    if (el === null) throw new Error(`no control matching "${selector}"`);
    return el;
}

// ============================================================================
// The text-shaped inputs — one control, one string
// ============================================================================

/** `[field, stored value, what the author types, what that commits]`. */
const TEXT_INPUTS: [Field, string, string, unknown][] = [
    [{ name: 'headline', type: 'text' }, 'Stored', 'Typed', 'Typed'],
    [{ name: 'excerpt', type: 'textarea' }, 'Stored', 'Typed', 'Typed'],
    [{ name: 'email', type: 'email' }, 'a@b.test', 'c@d.test', 'c@d.test'],
    [
        { name: 'website', type: 'url' },
        'https://a.test',
        'https://b.test',
        'https://b.test',
    ],
    [{ name: 'handle', type: 'slug' }, 'stored-slug', 'typed-slug', 'typed-slug'],
    [{ name: 'published', type: 'date' }, '2026-01-01', '2026-02-02', '2026-02-02'],
    [
        { name: 'startsAt', type: 'datetime' },
        '2026-01-01T09:00',
        '2026-02-02T10:30',
        '2026-02-02T10:30',
    ],
];

describe.each(TEXT_INPUTS)('%o', (field, stored, typed, committed) => {
    const selector = `[name="${field.name}"]`;

    it('renders the stored value', () => {
        mountField(field, stored);

        expect(control<HTMLInputElement>(selector).value).toBe(stored);
    });

    it('shows a value that arrives after the first render', () => {
        const f = mountField(field, undefined);
        expect(control<HTMLInputElement>(selector).value).toBe('');

        f.rerender(stored);

        expect(control<HTMLInputElement>(selector).value).toBe(stored);
    });

    it('commits what the author types under the bare field name', async () => {
        const user = userEvent.setup();
        const f = mountField(field, '');

        const input = control<HTMLInputElement>(selector);
        await user.clear(input);
        await user.type(input, typed);

        expect(f.commits.at(-1)?.name).toBe(field.name);
        expect(f.last()).toBe(committed);
    });
});

// ============================================================================
// number — the one text-shaped input that does not commit a string
// ============================================================================

describe('number', () => {
    const field: Field = { name: 'rank', type: 'number' };

    it('renders the stored number and commits a number back', async () => {
        const user = userEvent.setup();
        const f = mountField(field, 3);
        expect(control<HTMLInputElement>('[name="rank"]').value).toBe('3');

        await user.type(control<HTMLInputElement>('[name="rank"]'), '7');

        expect(f.last()).toBe(37);
    });

    it('commits null for an emptied input rather than NaN', async () => {
        const user = userEvent.setup();
        const f = mountField(field, 3);

        await user.clear(control<HTMLInputElement>('[name="rank"]'));

        expect(f.last()).toBeNull();
    });
});

// ============================================================================
// boolean
// ============================================================================

describe('boolean', () => {
    const field: Field = { name: 'featured', type: 'boolean' };

    it('renders the stored flag and commits the toggled one', async () => {
        const user = userEvent.setup();
        const f = mountField(field, true);
        const toggle = control<HTMLInputElement>('input[type="checkbox"]');
        expect(toggle.checked).toBe(true);

        await user.click(toggle);

        expect(f.last()).toBe(false);
    });
});

// ============================================================================
// select and multiselect — a Base UI popup, not a native <select>
// ============================================================================

describe('select', () => {
    const field: Field = {
        name: 'category',
        type: 'select',
        options: ['news', 'guides'],
    };

    it('renders the stored option and commits the one the author picks', async () => {
        const user = userEvent.setup();
        const f = mountField(field, 'news');
        expect(control('.am-select-trigger-value').textContent).toBe('news');

        await user.click(control('button[role="combobox"]'));
        const guides = [...document.querySelectorAll('[role="option"]')].find(
            (option) => option.textContent === 'guides'
        );
        if (guides === undefined) throw new Error('the listbox has no "guides" option');
        await user.click(guides);

        expect(f.commits.at(-1)).toEqual({ name: 'category', value: 'guides' });
    });
});

describe('multiselect', () => {
    const field: Field = {
        name: 'tags',
        type: 'multiselect',
        options: ['news', 'guides'],
    };

    it('renders a chip per stored value and commits the whole array', async () => {
        const user = userEvent.setup();
        const f = mountField(field, ['news']);
        expect(
            [...document.querySelectorAll('.am-multiselect-chip-label')].map(
                (chip) => chip.textContent
            )
        ).toEqual(['news']);

        await user.click(control('[role="combobox"]'));
        const guides = [...document.querySelectorAll('[role="option"]')].find((option) =>
            (option.textContent ?? '').includes('guides')
        );
        if (guides === undefined) throw new Error('the listbox has no "guides" option');
        await user.click(guides);

        expect(f.last()).toEqual(['news', 'guides']);
    });
});

// ============================================================================
// checkbox-group and radio-group
// ============================================================================

describe('checkbox-group', () => {
    const field: Field = {
        name: 'topics',
        type: 'checkbox-group',
        options: ['news', 'guides'],
    };

    it('checks the stored options and commits the whole selection', async () => {
        const user = userEvent.setup();
        const f = mountField(field, ['news']);
        const boxes = [
            ...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
        ];
        expect(boxes.map((box) => box.checked)).toEqual([true, false]);

        const second = boxes[1];
        if (second === undefined) throw new Error('the group rendered one checkbox');
        await user.click(second);

        expect(f.last()).toEqual(['news', 'guides']);
    });
});

describe('radio-group', () => {
    const field: Field = {
        name: 'layout',
        type: 'radio-group',
        options: ['wide', 'narrow'],
    };

    it('selects the stored option and commits the one the author picks', async () => {
        const user = userEvent.setup();
        const f = mountField(field, 'wide');
        const radios = [
            ...document.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
        ];
        expect(radios.map((radio) => radio.checked)).toEqual([true, false]);

        const second = radios[1];
        if (second === undefined) throw new Error('the group rendered one radio');
        await user.click(second);

        expect(f.last()).toBe('narrow');
    });
});

// ============================================================================
// range and color — value in, no local copy
// ============================================================================

describe('range', () => {
    const field: Field = { name: 'weight', type: 'range', min: 0, max: 10 };

    it('renders the stored number and shows a later one', () => {
        const f = mountField(field, 4);
        expect(control<HTMLInputElement>('input[type="hidden"]').value).toBe('4');

        f.rerender(9);

        expect(control<HTMLInputElement>('input[type="hidden"]').value).toBe('9');
    });

    it('falls back to `min` when the entry stores nothing', () => {
        mountField({ name: 'weight', type: 'range', min: 2, max: 10 }, undefined);

        expect(control<HTMLInputElement>('input[type="hidden"]').value).toBe('2');
    });
});

describe('color', () => {
    const field: Field = { name: 'accent', type: 'color' };

    // The swatch is `react-colorful`, driven by pointer drags on a gradient that
    // has no layout under happy-dom, so only the display side is checked here.
    it('renders the stored hex and shows a later one', () => {
        const f = mountField(field, '#ff0000');
        expect(control('.am-color-picker-hex').textContent).toBe('#ff0000');

        f.rerender('#00ff00');

        expect(control('.am-color-picker-hex').textContent).toBe('#00ff00');
    });

    it('falls back to black when the entry stores nothing', () => {
        mountField(field, undefined);

        expect(control('.am-color-picker-hex').textContent).toBe('#000000');
    });
});
