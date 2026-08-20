/**
 * @vitest-environment happy-dom
 *
 * Server validation errors must reach the *nested* field that owns them.
 *
 * The error map the API returns is flat and keyed by full field path
 * (`blocks[6f1e2a].heading`), so a container's sub-field only renders its error
 * if it rebuilds exactly that path. `FormField` used to look the error up by the
 * bare `field.name` (`heading`), which can never match a nested key — the error
 * existed and was silently invisible.
 *
 * There is no `@testing-library/react` here, so this drives a real React root
 * directly (same approach as container-field-seeding.test.tsx).
 */

import type { Field } from '@/types/index';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import '@/admin/rendering/register-fields';
import { FieldErrorsProvider } from '@/admin/components/fields/field-errors-context';
import { FormField } from '@/admin/components/fields/form-field';

/** Render one FormField under an error map and return the resulting HTML. */
function renderField(
    field: Field,
    value: unknown,
    errors: Record<string, string[]>
): string {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(
            <FieldErrorsProvider value={errors}>
                <FormField field={field} value={value} onChange={() => undefined} />
            </FieldErrorsProvider>
        );
    });
    const html = container.innerHTML;
    act(() => root.unmount());
    container.remove();
    return html;
}

/** The messages actually rendered as field errors, in document order. */
function renderedErrors(html: string): string[] {
    const host = document.createElement('div');
    host.innerHTML = html;
    return [...host.querySelectorAll('.am-field-error')].map(
        (el) => el.textContent ?? ''
    );
}

// Top level — the path and the bare name coincide

describe('FormField error lookup', () => {
    it('renders a top-level error keyed by the bare field name', () => {
        const html = renderField({ name: 'title', type: 'text' }, '', {
            title: ['Title is required'],
        });
        expect(renderedErrors(html)).toEqual(['Title is required']);
    });

    it('renders nothing when the error map is empty', () => {
        const html = renderField({ name: 'title', type: 'text' }, '', {});
        expect(renderedErrors(html)).toEqual([]);
    });
});

describe('group field errors', () => {
    const seo: Field = {
        name: 'seo',
        type: 'group',
        fields: [
            { name: 'title', type: 'text' },
            { name: 'description', type: 'text' },
        ],
    };

    it('renders a sub-field error keyed by the dotted path', () => {
        const html = renderField(
            seo,
            { title: '' },
            {
                'seo.title': ['Too short'],
            }
        );
        expect(renderedErrors(html)).toEqual(['Too short']);
    });

    it('ignores a key that is only the bare sub-field name', () => {
        const html = renderField(seo, { title: '' }, { title: ['Too short'] });
        expect(renderedErrors(html)).toEqual([]);
    });

    it('nests through a group inside a group', () => {
        const outer: Field = {
            name: 'meta',
            type: 'group',
            fields: [seo],
        };
        const html = renderField(
            outer,
            { seo: { title: '' } },
            {
                'meta.seo.title': ['Too short'],
            }
        );
        expect(renderedErrors(html)).toEqual(['Too short']);
    });
});

// repeater / blocks / tree — item selectors address by `_id`, not index

describe('repeater field errors', () => {
    const links: Field = {
        name: 'links',
        type: 'repeater',
        fields: [{ name: 'label', type: 'text' }],
    };

    it('renders a sub-field error keyed by the item id', () => {
        const html = renderField(
            links,
            [
                { _id: 'i1', label: '' },
                { _id: 'i2', label: '' },
            ],
            { 'links[i2].label': ['Required'] }
        );
        expect(renderedErrors(html)).toEqual(['Required']);
    });

    it('ignores an index-keyed path', () => {
        const html = renderField(links, [{ _id: 'i1', label: '' }], {
            'links[0].label': ['Required'],
        });
        expect(renderedErrors(html)).toEqual([]);
    });
});

describe('blocks field errors', () => {
    const content: Field = {
        name: 'content',
        type: 'blocks',
        blocks: [{ type: 'hero', fields: [{ name: 'heading', type: 'text' }] }],
    };

    it('renders a sub-field error keyed by the block id', () => {
        const html = renderField(
            content,
            [
                { _id: 'b1', _type: 'hero', heading: '' },
                { _id: 'b2', _type: 'hero', heading: '' },
            ],
            { 'content[b2].heading': ['Required'] }
        );
        expect(renderedErrors(html)).toEqual(['Required']);
    });

    it('ignores an index-keyed path', () => {
        const html = renderField(content, [{ _id: 'b1', _type: 'hero', heading: '' }], {
            'content[0].heading': ['Required'],
        });
        expect(renderedErrors(html)).toEqual([]);
    });
});

describe('tree field errors', () => {
    const nav: Field = {
        name: 'nav',
        type: 'tree',
        fields: [{ name: 'label', type: 'text' }],
    };

    it('addresses a child node by its id, with no `_children` in the path', () => {
        const html = renderField(
            nav,
            [{ _id: 'n1', label: '', _children: [{ _id: 'n2', label: '' }] }],
            { 'nav[n2].label': ['Required'] }
        );
        expect(renderedErrors(html)).toEqual(['Required']);
    });
});
