/**
 * @vitest-environment happy-dom
 *
 * Both media surfaces share this component, so the branch it picks decides
 * whether a filtered-empty list wrongly invites an upload.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { MediaEmpty } from '@/admin/components/media/media-empty.js';
import en from '@/admin/locales/en.json';
import type { MediaBrowserQuery } from '@/admin/types/media.js';

const BROWSING: MediaBrowserQuery = { q: '', type: 'all', page: 1 };

beforeAll(async () => {
    // The states differ only in their copy, so real strings are needed; the
    // SPA's own i18n module pulls in virtual modules, so stand up a bare one.
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: en } },
        interpolation: { escapeValue: false },
    });
});

afterEach(cleanup);

/** Render the empty state for one browsing query and permission. */
function renderEmpty(query: Partial<MediaBrowserQuery>, canUpload: boolean): void {
    render(
        <MediaEmpty
            query={{ ...BROWSING, ...query }}
            canUpload={canUpload}
            isUploading={false}
            onUpload={vi.fn()}
            accept="image/*"
            multiple
        />
    );
}

describe('MediaEmpty unfiltered', () => {
    it('should render the upload zone when the viewer may upload', () => {
        renderEmpty({}, true);

        expect(document.querySelector('.am-upload-zone')).not.toBeNull();
    });

    it('should render a plain empty state without the upload permission', () => {
        renderEmpty({}, false);

        expect(document.querySelector('.am-upload-zone')).toBeNull();
        expect(screen.queryByText('No results')).not.toBeNull();
    });
});

describe('MediaEmpty filtered', () => {
    it('should name the search term rather than invite an upload', () => {
        renderEmpty({ q: 'cat' }, true);

        expect(screen.queryByText('No media matching "cat"')).not.toBeNull();
        expect(document.querySelector('.am-upload-zone')).toBeNull();
    });

    it('should name the type filter when the search is empty', () => {
        renderEmpty({ type: 'images' }, true);

        expect(screen.queryByText('No images found')).not.toBeNull();
        expect(document.querySelector('.am-upload-zone')).toBeNull();
    });

    it('should prefer the search term over the type filter', () => {
        renderEmpty({ q: 'cat', type: 'images' }, true);

        expect(screen.queryByText('No media matching "cat"')).not.toBeNull();
        expect(screen.queryByText('No images found')).toBeNull();
    });
});
