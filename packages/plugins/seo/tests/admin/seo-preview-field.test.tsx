/**
 * The SEO preview field: it shows its sibling meta title and description as a
 * search result would, cuts each at the length a search engine shows, and
 * shows a placeholder for a value not written yet.
 */

import type { RenderAdminResult } from '../../../../admin/tests/_support/render-admin';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    FieldPathProvider,
    FieldValuesProvider,
} from '../../../../admin/src/components/fields/field-context';
import { renderPluginPage } from '../../../../admin/tests/_support/render-admin';
import { field } from '../../../../astromech/tests/_support/fixtures';
import SeoPreviewField from '../../src/admin/fields/seo-preview-field';
import en from '../../src/locales/en.json';

/** Render the preview inside the SEO group, as `seo.section()` places it. */
function renderPreview(seo: Record<string, unknown>): RenderAdminResult {
    return renderPluginPage(
        <FieldValuesProvider values={{ seo }}>
            <FieldPathProvider path="seo.preview">
                <SeoPreviewField
                    name="seo.preview"
                    value={undefined}
                    field={field({ name: 'preview', type: 'seo-preview' })}
                    onChange={() => undefined}
                />
            </FieldPathProvider>
        </FieldValuesProvider>,
        {
            plugin: { namespace: 'seo', serviceKey: 'seo', permissionNamespace: 'seo' },
            translations: en,
        }
    );
}

describe('SeoPreviewField', () => {
    it('shows the meta title and description written beside it', async () => {
        renderPreview({
            title: 'Hello world | Example',
            description: 'A short page about saying hello.',
        });

        const title = await screen.findByText('Hello world | Example');
        const description = screen.getByText('A short page about saying hello.');
        expect(title.classList.contains('am-seo-preview--placeholder')).toBe(false);
        expect(description.classList.contains('am-seo-preview--placeholder')).toBe(false);
    });

    it('shows a placeholder for a title or description not written yet', async () => {
        renderPreview({ title: '', description: null });

        const title = await screen.findByText('Meta title preview');
        const description = screen.getByText(
            'The meta description will be shown here as it would appear in search results.'
        );
        expect(title.classList.contains('am-seo-preview--placeholder')).toBe(true);
        expect(description.classList.contains('am-seo-preview--placeholder')).toBe(true);
    });

    it('cuts a title past 60 characters and a description past 160', async () => {
        renderPreview({ title: 'T'.repeat(61), description: 'D'.repeat(161) });

        expect(await screen.findByText(`${'T'.repeat(60)}…`)).not.toBeNull();
        expect(screen.getByText(`${'D'.repeat(160)}…`)).not.toBeNull();
    });
});
