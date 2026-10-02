/**
 * @vitest-environment happy-dom
 *
 * The picker owns its own toolbar since the browser split, so the upload
 * button it renders there is the only thing gating `media:upload`.
 */

import type { Media } from '@/types/index';
import type { UserEvent } from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaPicker } from '@/admin/components/media/media-picker';
import { renderWithProviders } from '../../_support/render-admin';

const { mediaQuery, uploadMedia } = vi.hoisted(() => ({
    mediaQuery: vi.fn(),
    uploadMedia: vi.fn(),
}));

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: {
            ...real.astromechUntypedClient,
            media: { query: mediaQuery, upload: uploadMedia },
        },
    };
});

function mediaItem(id: string, filename: string): Media {
    return {
        id,
        filename,
        mimeType: 'image/png',
        size: 2048,
        url: `/media/${filename}`,
        width: null,
        height: null,
        metadata: null,
        alt: '',
        title: '',
        caption: '',
        fields: {},
        locale: 'en',
        locales: ['en'],
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        createdBy: null,
        updatedBy: null,
    };
}

const ITEMS = [
    mediaItem('m1', 'cat.png'),
    mediaItem('m2', 'dog.png'),
    mediaItem('m3', 'bird.png'),
];

const UPLOAD_ZONE_LABEL = 'Drop files here or click to upload';

afterEach(() => {
    mediaQuery.mockReset();
    uploadMedia.mockReset();
});

type PickerOptions = {
    items?: Media[];
    canUpload?: boolean;
    selectedIds?: string[];
};

/** Render the picker over a fixed page of results and permission set. */
function renderPicker({
    items = ITEMS,
    canUpload = true,
    selectedIds = [],
}: PickerOptions = {}): { onPick: ReturnType<typeof vi.fn>; user: UserEvent } {
    mediaQuery.mockResolvedValue({
        data: items,
        pagination: { total: items.length, pages: 1 },
    });
    const onPick = vi.fn();

    const { user } = renderWithProviders(
        <MediaPicker
            query={{ q: '', type: 'all', page: 1 }}
            onQueryChange={vi.fn()}
            selectedIds={selectedIds}
            onPick={onPick}
            multiple={false}
        />,
        { permissions: canUpload ? ['media:read', 'media:upload'] : ['media:read'] }
    );

    return { onPick, user };
}

/** Wait out the loading state by finding the first tile. */
async function findTile(filename: string): Promise<HTMLElement> {
    return screen.findByRole('button', { name: filename });
}

/** The card element wrapping a tile, which carries the selection class. */
function cardFor(filename: string): Element {
    const card = screen.getByRole('button', { name: filename }).closest('.am-media-card');
    if (card === null) throw new Error(`No media card for ${filename}`);
    return card;
}

describe('MediaPicker upload permission', () => {
    it('should render the upload button when the viewer may upload', async () => {
        renderPicker({ canUpload: true });
        await findTile('cat.png');

        expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeNull();
    });

    it('should render no upload button without the permission', async () => {
        renderPicker({ canUpload: false });
        await findTile('cat.png');

        expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull();
    });
});

describe('MediaPicker grid', () => {
    it('should render one tile per item', async () => {
        renderPicker();
        await findTile('cat.png');

        expect(document.querySelectorAll('.am-media-card')).toHaveLength(3);
    });

    it('should call onPick with the clicked item', async () => {
        const { onPick, user } = renderPicker();
        await findTile('dog.png');

        await user.click(screen.getByRole('button', { name: 'dog.png' }));

        expect(onPick).toHaveBeenCalledWith(ITEMS[1]);
    });

    it('should mark only the tiles whose ids are selected', async () => {
        renderPicker({ selectedIds: ['m2'] });
        await findTile('dog.png');

        expect(cardFor('dog.png').classList.contains('am-media-card-selected')).toBe(
            true
        );
        expect(cardFor('cat.png').classList.contains('am-media-card-selected')).toBe(
            false
        );
        expect(document.querySelectorAll('.am-media-card-selected')).toHaveLength(1);
    });

    it('should mark no tile when nothing is selected', async () => {
        renderPicker({ selectedIds: [] });
        await findTile('cat.png');

        expect(document.querySelectorAll('.am-media-card-selected')).toHaveLength(0);
    });
});

describe('MediaPicker empty results', () => {
    it('should render the empty state instead of a grid', async () => {
        renderPicker({ items: [] });
        await screen.findByRole('button', { name: UPLOAD_ZONE_LABEL });

        expect(document.querySelector('.am-content-grid')).toBeNull();
        expect(document.querySelectorAll('.am-media-card')).toHaveLength(0);
    });
});
