/**
 * @vitest-environment happy-dom
 *
 * A plugin field type renders behind `React.lazy`, so its renderer does not
 * exist on the render where the entry form still holds `fields: {}` (the fact
 * pinned in `entry-form-field-seeding.test.tsx`). `PluginField` keeps no copy of
 * the value — it passes each render's prop straight down — so the stored value
 * lands whenever it arrives, before or after the module.
 *
 * The registration's `defaultValue` fills in only for a value of `undefined`,
 * which the loading form and an entry with no stored value look alike from.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { BaseFieldProps, Field } from '@/types/index';
import '@/admin/rendering/register-fields';
import { FormField } from '@/admin/components/fields/form-field';

const { fieldTypes } = vi.hoisted(() => ({
    fieldTypes: {} as Record<string, unknown>,
}));

vi.mock('virtual:astromech/plugins/components', () => ({
    fieldTypes,
    pages: {},
    hostPages: {},
    i18n: {},
    slots: { 'global-overlay': [], 'right-drawer': [], toolbar: [] },
}));

afterEach(cleanup);

/** A renderer that shows the value it is handed and can write a new one. */
function StubRenderer({ name, value, onChange }: BaseFieldProps): React.ReactElement {
    return (
        <input
            name={name}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(name, event.target.value)}
        />
    );
}

type Registration = {
    /** Resolve the renderer module, as the code-gen'd `import()` would. */
    resolve: () => void;
    type: string;
};

/**
 * Register a plugin field type whose module lands on command. The type name is
 * unique per call because `plugin-field.tsx` caches its lazy wrappers by type.
 */
function registerFieldType(
    options: {
        defaultValue?: unknown;
        validate?: (value: unknown) => string | undefined;
    } = {}
): Registration {
    const type = `stub-${Math.random().toString(36).slice(2)}`;
    let resolve!: () => void;
    const loaded = new Promise<void>((r) => {
        resolve = r;
    });

    fieldTypes[type] = {
        plugin: 'stub-plugin',
        serviceKey: 'stub',
        namespace: 'stub',
        ...(options.defaultValue !== undefined
            ? { defaultValue: options.defaultValue }
            : {}),
        load: async () => {
            await loaded;
            return {
                default: StubRenderer,
                ...(options.validate !== undefined ? { validate: options.validate } : {}),
            };
        },
    };

    return { type, resolve };
}

type Mounted = {
    /** Every `onChange` the field has fired, oldest first. */
    commits: { name: string; value: unknown }[];
    /** Push a new value down, as the default-value copy landing would. */
    rerender: (value: unknown) => void;
};

/** Mount one plugin `FormField` whose value can be replaced after mount. */
function mountField(field: Field, value: unknown): Mounted {
    const commits: { name: string; value: unknown }[] = [];
    let push!: (value: unknown) => void;

    function Holder(): React.ReactElement {
        const [current, setCurrent] = React.useState(value);
        push = setCurrent;
        return (
            <FormField
                field={field}
                value={current}
                onChange={(name, changed) => commits.push({ name, value: changed })}
            />
        );
    }

    render(<Holder />);

    return { commits, rerender: (next) => act(() => push(next)) };
}

/** Let the lazy module resolve and Suspense re-render. */
async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

describe('a plugin field type', () => {
    it('shows a spinner until its module lands', async () => {
        const { type, resolve } = registerFieldType();
        mountField({ name: 'preview', type }, 'Stored');

        expect(document.querySelector('.am-spinner')).not.toBeNull();

        resolve();
        await settle();

        expect(document.querySelector('.am-spinner')).toBeNull();
        expect(screen.getByRole('textbox')).toHaveProperty('value', 'Stored');
    });

    it('renders a value that arrives after the module', async () => {
        const { type, resolve } = registerFieldType();
        const f = mountField({ name: 'preview', type }, undefined);
        resolve();
        await settle();

        f.rerender('Stored');

        expect(screen.getByRole('textbox')).toHaveProperty('value', 'Stored');
    });

    it('commits what the renderer reports, under the bare field name', async () => {
        const user = userEvent.setup();
        const { type, resolve } = registerFieldType();
        const f = mountField({ name: 'preview', type }, '');
        resolve();
        await settle();

        await user.type(screen.getByRole('textbox'), 'x');

        expect(f.commits.at(-1)).toEqual({ name: 'preview', value: 'x' });
    });

    it('fills in the registered default only when nothing is stored', async () => {
        const withDefault = registerFieldType({ defaultValue: 'From the plugin' });
        mountField({ name: 'preview', type: withDefault.type }, undefined);
        withDefault.resolve();
        await settle();
        expect(screen.getByRole('textbox')).toHaveProperty('value', 'From the plugin');

        cleanup();
        const stored = registerFieldType({ defaultValue: 'From the plugin' });
        mountField({ name: 'preview', type: stored.type }, 'Stored');
        stored.resolve();
        await settle();
        expect(screen.getByRole('textbox')).toHaveProperty('value', 'Stored');
    });

    it('renders the registration’s validation message inline', async () => {
        const user = userEvent.setup();
        const { type, resolve } = registerFieldType({
            validate: (value) => (value === 'x' ? 'Not allowed' : undefined),
        });
        mountField({ name: 'preview', type }, '');
        resolve();
        await settle();

        await user.type(screen.getByRole('textbox'), 'x');

        expect(screen.getByText('Not allowed')).toBeDefined();
    });
});
