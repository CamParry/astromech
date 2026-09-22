/**
 * @vitest-environment happy-dom
 *
 * The entry field renderer: a named group scopes its children's values and
 * paths to its key, an unnamed group draws a surface over its parent's values,
 * and a layout field inside a container item renders its fields as controls.
 */

import type { DataField, Field } from '@/types/index';
import { act, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import '@/admin/rendering/register-fields';
import { EntryFieldColumn } from '@/admin/components/entries/entry-fields-renderer';
import { useFieldValue } from '@/admin/components/fields/field-context';
import { FormField } from '@/admin/components/fields/form-field';
import { registerField } from '@/admin/rendering/field-registry';
import { accordion, group, repeater, tab, tabs, text } from '@/fields/builder';

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: {} } },
    });
});

type Commit = { name: string; value: unknown };

/** The input rendered for a full field path, failing loudly when there is none. */
function inputFor(host: HTMLElement, path: string): HTMLInputElement {
    const input = host.querySelector<HTMLInputElement>(`input[name="${path}"]`);
    if (input === null) {
        const names = [...host.querySelectorAll('input')].map((el) =>
            el.getAttribute('name')
        );
        throw new Error(`no input named "${path}"; rendered: ${names.join(', ')}`);
    }
    return input;
}

function typeInto(input: HTMLInputElement, text: string): void {
    // Setting `value` through the prototype setter makes React treat the
    // following `input` event as a real change.
    Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
    )?.set?.call(input, text);
    act(() => {
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

function mountColumn(nodes: Field[], values: Record<string, unknown>) {
    const commits: Commit[] = [];
    const { container } = render(
        <EntryFieldColumn
            nodes={nodes}
            values={values}
            onChange={(name, value) => commits.push({ name, value })}
        />
    );
    return { host: container, commits };
}

describe('EntryFieldColumn', () => {
    it('renders a named group at the root as a titled panel over its key', () => {
        const { host, commits } = mountColumn(
            [
                text('title'),
                group('seo', {
                    label: 'SEO',
                    description: 'How the page appears in search',
                    fields: [text('metaTitle')],
                }),
            ],
            { title: 'Hello', seo: { metaTitle: 'Meta' } }
        );

        const heading = screen.getByRole('heading', { name: 'SEO' });
        const panel = heading.closest('.am-panel');
        expect(panel).not.toBeNull();
        expect(panel?.textContent).toContain('How the page appears in search');

        const input = inputFor(host, 'seo.metaTitle');
        expect(panel?.contains(input)).toBe(true);
        expect(input.value).toBe('Meta');

        typeInto(input, 'Changed');
        expect(commits.at(-1)).toEqual({ name: 'seo', value: { metaTitle: 'Changed' } });
    });

    it('scopes a named tab through an inner unnamed group to the tab name', () => {
        const { host, commits } = mountColumn(
            [
                tabs({
                    fields: [
                        tab('seo', {
                            label: 'Search',
                            fields: [
                                group({ label: 'Listing', fields: [text('title')] }),
                            ],
                        }),
                    ],
                }),
            ],
            { seo: { title: 'Old' } }
        );

        expect(screen.getByRole('tab', { name: 'Search' })).toBeDefined();
        const heading = screen.getByRole('heading', { name: 'Listing' });

        const input = inputFor(host, 'seo.title');
        expect(heading.closest('.am-panel')?.contains(input)).toBe(true);
        expect(input.value).toBe('Old');

        typeInto(input, 'New');
        expect(commits.at(-1)).toEqual({ name: 'seo', value: { title: 'New' } });
    });

    it('lets a field inside a named group panel read its siblings', () => {
        registerField('sibling-probe', function SiblingProbe() {
            return <output>{String(useFieldValue('title'))}</output>;
        });
        mountColumn(
            [
                group('seo', {
                    label: 'SEO',
                    fields: [text('title'), { name: 'preview', type: 'sibling-probe' }],
                }),
            ],
            { seo: { title: 'From the group' } }
        );

        expect(screen.getByRole('status').textContent).toBe('From the group');
    });
});

describe('container items', () => {
    it('renders the fields of a layout field inside a repeater item as controls', () => {
        const links: DataField = repeater('links', {
            fields: [
                group({ label: 'Target', fields: [text('href')] }),
                accordion({ label: 'More', fields: [text('rel')] }),
            ],
        });
        const commits: Commit[] = [];
        const { container: host } = render(
            <FormField
                field={links}
                value={[{ _id: 'l1', href: '/a', rel: 'nofollow' }]}
                onChange={(name, value) => commits.push({ name, value })}
            />
        );

        expect(inputFor(host, 'links[l1].href').value).toBe('/a');
        expect(inputFor(host, 'links[l1].rel').value).toBe('nofollow');
        expect(screen.getByText('Target')).toBeDefined();

        typeInto(inputFor(host, 'links[l1].href'), '/b');
        expect(commits.at(-1)?.value).toEqual([
            { _id: 'l1', href: '/b', rel: 'nofollow' },
        ]);
    });
});
