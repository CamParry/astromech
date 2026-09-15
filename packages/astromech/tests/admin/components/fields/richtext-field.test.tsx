/**
 * @vitest-environment happy-dom
 *
 * The rich text field. `coerceToDoc` turns a stored value into a TipTap
 * document or nothing, and `RichtextField` renders that document and reports
 * each edit as a document under the bare field name.
 */

import type { Field } from '@/types/index';
import type { JSONContent } from '@tiptap/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { coerceToDoc, RichtextField } from '@/admin/components/fields/richtext-field';

/** A document holding one paragraph of `text`. */
function paragraphDoc(text: string): JSONContent {
    return {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    };
}

describe('coerceToDoc', () => {
    it('returns undefined for null and undefined', () => {
        expect(coerceToDoc(null)).toBeUndefined();
        expect(coerceToDoc(undefined)).toBeUndefined();
    });

    it('passes a document object through unchanged', () => {
        const doc = paragraphDoc('hello');
        expect(coerceToDoc(doc)).toBe(doc);
    });

    it('wraps a plain string in a one-paragraph document', () => {
        expect(coerceToDoc('some text')).toEqual(paragraphDoc('some text'));
    });

    it('keeps the markup of a legacy HTML string as literal text', () => {
        expect(coerceToDoc('<p>Hello</p>')).toEqual(paragraphDoc('<p>Hello</p>'));
    });

    it('returns undefined for an empty or whitespace-only string', () => {
        expect(coerceToDoc('')).toBeUndefined();
        expect(coerceToDoc('   ')).toBeUndefined();
    });

    it('returns undefined for a number or an array', () => {
        expect(coerceToDoc(42)).toBeUndefined();
        expect(coerceToDoc([1, 2, 3])).toBeUndefined();
    });
});

type Commit = { name: string; value: unknown };

const body: Field = { name: 'body', type: 'richtext' };

/** Render the field and collect every `onChange` it fires, oldest first. */
function mount(
    value: unknown,
    options: { field?: Field; disabled?: boolean } = {}
): Commit[] {
    const commits: Commit[] = [];
    render(
        <RichtextField
            name="body"
            value={value}
            field={options.field ?? body}
            {...(options.disabled !== undefined ? { disabled: options.disabled } : {})}
            onChange={(name, changed) => {
                commits.push({ name, value: changed });
            }}
        />
    );
    return commits;
}

/** The editor's contenteditable, once TipTap has mounted it. */
async function editable(): Promise<HTMLElement> {
    return waitFor(() => {
        const el = document.querySelector<HTMLElement>('.am-richtext-content');
        if (el === null) throw new Error('editor not mounted');
        return el;
    });
}

describe('RichtextField', () => {
    it('renders a stored document without reporting a change', async () => {
        const commits = mount(paragraphDoc('Stored prose'));

        expect((await editable()).textContent).toBe('Stored prose');
        expect(commits).toEqual([]);
    });

    it('renders a legacy string as a paragraph', async () => {
        mount('Legacy text');

        expect((await editable()).querySelector('p')?.textContent).toBe('Legacy text');
    });

    it('renders an empty editor for no value', async () => {
        mount(null);

        expect((await editable()).textContent).toBe('');
    });

    it('reports each edit as a document under the bare field name', async () => {
        const user = userEvent.setup();
        const commits = mount(null);
        const el = await editable();

        await user.click(el);
        await user.type(el, 'Hello');

        expect(commits.length).toBeGreaterThan(0);
        expect(commits.every((commit) => commit.name === 'body')).toBe(true);
        expect(commits.at(-1)?.value).toMatchObject(paragraphDoc('Hello'));
    });

    it('renders a read-only editor when disabled', async () => {
        mount(paragraphDoc('Locked'), { disabled: true });

        const el = await editable();
        expect(el.getAttribute('contenteditable')).toBe('false');
        expect(el.textContent).toBe('Locked');
    });

    it('offers only the toolbar controls the field allows', async () => {
        mount(null, {
            field: {
                name: 'body',
                type: 'richtext',
                allow: { bold: false, link: false },
            },
        });
        await editable();

        expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Link' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Italic' })).toBeDefined();
    });
});
