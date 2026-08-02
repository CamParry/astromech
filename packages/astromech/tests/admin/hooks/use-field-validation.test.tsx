/**
 * @vitest-environment happy-dom
 *
 * The browser-side validation runner and, more importantly, its REVEAL policy.
 *
 * The runner itself is the server's own `processFields`, so what is wrong is
 * already covered by the pipeline's own tests. What is only testable here is
 * *when* the author is told: a pristine field stays silent on blur (tabbing
 * through a form to survey it must not turn it red), a dirty one speaks up, and
 * a field already showing an error clears on the keystroke that fixes it rather
 * than on a second blur.
 *
 * Plus the two data-dependent checks the browser cannot run — `unique` (needs a
 * read) and `custom` (a function, which `JSON.stringify` strips on its way into
 * the admin config) — which must be skipped in silence, never guessed at.
 *
 * Warnings ride the same reveal set as errors and block nothing, which is why
 * blur reveals a path whether or not it has an error to show.
 *
 * There is no `@testing-library/react` here, so this drives a real React root
 * directly (same approach as container-field-editing.test.tsx).
 */

import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import React, { act } from 'react';
import type { FieldDefinition, FieldErrors, ValidationRule } from '@/types/index.js';
import { useFieldValidation } from '@/admin/hooks/use-field-validation.js';
import type { FieldValidationHandle } from '@/admin/hooks/use-field-validation.js';

type Mounted = {
    handle: () => FieldValidationHandle;
    /** The errors the UI would render right now. */
    errors: () => FieldErrors;
    /** The advisory messages the UI would render right now. */
    warnings: () => FieldErrors;
    /** Replace the whole field-value object, as the form does per keystroke. */
    setValues: (values: Record<string, unknown>) => void;
    unmount: () => void;
};

function mountValidation(
    definitions: FieldDefinition[],
    initialValues: Record<string, unknown>,
    operation: 'create' | 'update' = 'update'
): Mounted {
    let latest: FieldValidationHandle | undefined;
    let replace: ((values: Record<string, unknown>) => void) | undefined;

    function Probe(): null {
        const [values, setValues] = React.useState(initialValues);
        replace = setValues;
        latest = useFieldValidation({ definitions, values, operation });
        return null;
    }

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
        root.render(<Probe />);
    });

    const handle = (): FieldValidationHandle => {
        if (latest === undefined) throw new Error('the probe never rendered');
        return latest;
    };

    return {
        handle,
        errors: () => handle().errors,
        warnings: () => handle().warnings,
        setValues: (values) => {
            act(() => {
                replace?.(values);
            });
        },
        unmount: () => {
            act(() => root.unmount());
            host.remove();
        },
    };
}

/** Let every in-flight validation run settle and its state land. */
async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

/** Run `validateAll` inside `act` so the reveal it performs is flushed. */
async function validateAll(
    mounted: Mounted,
    stage: 'save' | 'publish'
): Promise<FieldErrors> {
    let errors: FieldErrors = {};
    await act(async () => {
        errors = await mounted.handle().validateAll(stage);
    });
    return errors;
}

// `new URL('htp:/x')` actually PARSES (any scheme is legal), so a test needs a
// string with no scheme at all to be genuinely invalid.
const INVALID_URL = 'not a url';

const linkField: FieldDefinition = { name: 'link', type: 'url' };

// ============================================================================
// Blur — gated on dirty
// ============================================================================

describe('reveal on blur', () => {
    it('should reveal nothing when a pristine field holds an invalid value', async () => {
        const m = mountValidation([linkField], { link: INVALID_URL });

        act(() => m.handle().reportBlur('link'));
        await settle();

        expect(m.errors()).toEqual({});
        m.unmount();
    });

    it('should reveal exactly one message once the field is dirty', async () => {
        const m = mountValidation([linkField], { link: INVALID_URL });

        act(() => {
            m.handle().markDirty('link');
            m.handle().reportBlur('link');
        });
        await settle();

        expect(m.errors()).toEqual({ link: ['Must be a valid URL'] });
        m.unmount();
    });

    it('should keep every other field silent when one field blurs', async () => {
        const m = mountValidation([linkField, { name: 'site', type: 'url' }], {
            link: INVALID_URL,
            site: INVALID_URL,
        });

        act(() => {
            m.handle().markDirty('link');
            m.handle().reportBlur('link');
        });
        await settle();

        expect(Object.keys(m.errors())).toEqual(['link']);
        m.unmount();
    });
});

// ============================================================================
// Change — "reward early", once something is already showing
// ============================================================================

describe('re-validation while showing an error', () => {
    it('should clear a revealed error on the change that fixes it, with no second blur', async () => {
        const m = mountValidation([linkField], { link: INVALID_URL });
        act(() => {
            m.handle().markDirty('link');
            m.handle().reportBlur('link');
        });
        await settle();
        expect(m.errors()).toEqual({ link: ['Must be a valid URL'] });

        m.setValues({ link: 'https://example.com' });
        await settle();

        expect(m.errors()).toEqual({});
        m.unmount();
    });

    it('should stay silent while a never-revealed field is typed into', async () => {
        const m = mountValidation([linkField], { link: '' });

        act(() => m.handle().markDirty('link'));
        m.setValues({ link: 'no' });
        await settle();

        expect(m.errors()).toEqual({});
        m.unmount();
    });
});

// ============================================================================
// Completeness is publish-only
// ============================================================================

describe('required', () => {
    const titleField: FieldDefinition = { name: 'title', type: 'text', required: true };

    it('should reveal nothing on blur, even when the field is dirty', async () => {
        const m = mountValidation([titleField], { title: '' });

        act(() => {
            m.handle().markDirty('title');
            m.handle().reportBlur('title');
        });
        await settle();

        expect(m.errors()).toEqual({});
        m.unmount();
    });

    it('should be absent from a save-stage validateAll', async () => {
        const m = mountValidation([titleField], { title: '' });

        expect(await validateAll(m, 'save')).toEqual({});
        m.unmount();
    });

    it('should be present in a publish-stage validateAll', async () => {
        const m = mountValidation([titleField], { title: '' });

        expect(await validateAll(m, 'publish')).toEqual({
            title: ['This field is required'],
        });
        expect(m.errors()).toEqual({ title: ['This field is required'] });
        m.unmount();
    });
});

// ============================================================================
// Data-dependent checks are skipped in silence
// ============================================================================

describe('server-only rules', () => {
    it('should never produce a client error for a `unique` rule', async () => {
        const slug: FieldDefinition = {
            name: 'slug',
            type: 'text',
            validation: [{ unique: true }],
        };
        const m = mountValidation([slug], { slug: 'already-taken' });

        expect(await validateAll(m, 'publish')).toEqual({});
        m.unmount();
    });

    it('should never produce a client error for a `custom` rule flattened to {}', async () => {
        // Exactly what the admin config does to it: `JSON.stringify` empties an
        // object whose only property is a function, so `runRule` falls through
        // every `in` check and returns null. Inert — but by accident.
        const flattened = JSON.parse(
            JSON.stringify({ custom: () => Promise.resolve('Never allowed') })
        ) as ValidationRule;
        expect(flattened).toEqual({});

        const code: FieldDefinition = {
            name: 'code',
            type: 'text',
            validation: [flattened],
        };
        const m = mountValidation([code], { code: 'anything' });

        expect(await validateAll(m, 'publish')).toEqual({});
        m.unmount();
    });
});

// ============================================================================
// Nested containers — the `_id`-bracket path grammar
// ============================================================================

describe('nested fields', () => {
    const items: FieldDefinition = {
        name: 'items',
        type: 'repeater',
        fields: [{ name: 'link', type: 'url' }],
    };

    it('should reveal an invalid repeater sub-field under its item id', async () => {
        const m = mountValidation([items], {
            items: [
                { _id: 'i1', link: 'https://example.com' },
                { _id: 'i2', link: INVALID_URL },
            ],
        });

        act(() => {
            m.handle().markDirty('items[i2].link');
            m.handle().reportBlur('items[i2].link');
        });
        await settle();

        expect(m.errors()).toEqual({ 'items[i2].link': ['Must be a valid URL'] });
        m.unmount();
    });

    it('should not reveal the same error under a bare sub-field name', async () => {
        const m = mountValidation([items], {
            items: [{ _id: 'i1', link: INVALID_URL }],
        });

        act(() => {
            m.handle().markDirty('link');
            m.handle().reportBlur('link');
        });
        await settle();

        expect(m.errors()).toEqual({});
        m.unmount();
    });
});

// ============================================================================
// Warnings — advisory, and the browser's alone
// ============================================================================

describe('warnings', () => {
    /** A length cap the author is nudged about but never stopped by. */
    const summary: FieldDefinition = {
        name: 'summary',
        type: 'text',
        validation: [{ maxLength: 10, severity: 'warning' }],
    };
    const TOO_LONG = 'far longer than ten';

    it('should file a warning-severity rule under warnings, not errors', async () => {
        const m = mountValidation([summary], { summary: TOO_LONG });

        await validateAll(m, 'publish');

        expect(m.errors()).toEqual({});
        expect(m.warnings()).toEqual({ summary: ['Must be at most 10 characters'] });
        m.unmount();
    });

    it('should not block a submit', async () => {
        const m = mountValidation([summary], { summary: TOO_LONG });

        expect(await validateAll(m, 'publish')).toEqual({});
        m.unmount();
    });

    it('should reveal a warning-only field on blur once it is dirty', async () => {
        const m = mountValidation([summary], { summary: TOO_LONG });

        act(() => {
            m.handle().markDirty('summary');
            m.handle().reportBlur('summary');
        });
        await settle();

        expect(m.warnings()).toEqual({ summary: ['Must be at most 10 characters'] });
        m.unmount();
    });

    it('should stay silent on blur while the field is pristine', async () => {
        const m = mountValidation([summary], { summary: TOO_LONG });

        act(() => m.handle().reportBlur('summary'));
        await settle();

        expect(m.warnings()).toEqual({});
        m.unmount();
    });

    it('should file both messages under one path when a field has each', async () => {
        const both: FieldDefinition = {
            name: 'summary',
            type: 'text',
            validation: [{ minLength: 20 }, { maxLength: 10, severity: 'warning' }],
        };
        const m = mountValidation([both], { summary: TOO_LONG });

        await validateAll(m, 'publish');

        // Both are reported; `FieldWrapper` is what drops the warning in favour
        // of the error (see field-wrapper-warning.test.tsx).
        expect(m.errors()).toEqual({ summary: ['Must be at least 20 characters'] });
        expect(m.warnings()).toEqual({ summary: ['Must be at most 10 characters'] });
        m.unmount();
    });
});

// ============================================================================
// Server errors
// ============================================================================

describe('server errors', () => {
    it('should merge server errors into what the UI renders', async () => {
        const m = mountValidation([linkField], { link: 'https://example.com' });

        act(() => m.handle().setServerErrors({ link: ['Already in use'] }));

        expect(m.errors()).toEqual({ link: ['Already in use'] });
        m.unmount();
    });

    it('should drop a server error for a path the author has since edited', async () => {
        const m = mountValidation([linkField], { link: 'https://example.com' });
        act(() => m.handle().setServerErrors({ link: ['Already in use'] }));

        act(() => m.handle().markDirty('link'));

        expect(m.errors()).toEqual({});
        m.unmount();
    });

    it('should leave other paths’ server errors alone', async () => {
        const m = mountValidation([linkField], { link: 'https://example.com' });
        act(() =>
            m.handle().setServerErrors({
                link: ['Already in use'],
                title: ['Already in use'],
            })
        );

        act(() => m.handle().markDirty('link'));

        expect(m.errors()).toEqual({ title: ['Already in use'] });
        m.unmount();
    });

    it('should let a fresher client error win on a shared key', async () => {
        const m = mountValidation([linkField], { link: INVALID_URL });
        act(() => m.handle().setServerErrors({ link: ['Already in use'] }));

        await validateAll(m, 'publish');

        expect(m.errors()).toEqual({ link: ['Must be a valid URL'] });
        m.unmount();
    });

    it('should clear every server error on reset', async () => {
        const m = mountValidation([linkField], { link: 'https://example.com' });
        act(() => m.handle().setServerErrors({ link: ['Already in use'] }));

        act(() => m.handle().resetServerErrors());

        expect(m.errors()).toEqual({});
        m.unmount();
    });
});

// ============================================================================
// The live form state must not be written to
// ============================================================================

describe('form state', () => {
    it('should not seed defaults into the values it was handed', async () => {
        const withDefault: FieldDefinition = {
            name: 'kind',
            type: 'text',
            defaultValue: 'article',
        };
        const values: Record<string, unknown> = {};
        const m = mountValidation([withDefault], values, 'create');

        await validateAll(m, 'publish');

        expect(values).toEqual({});
        m.unmount();
    });
});
