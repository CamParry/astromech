import React from 'react';
import { File, FileText, Music, Video } from 'lucide-react';
import type { TypeFilter } from '../types/media.js';
import type { Media } from '@/types/index.js';

export function matchesTypeFilter(mimeType: string, filter: TypeFilter): boolean {
    if (filter === 'all') return true;
    if (filter === 'images') return mimeType.startsWith('image/');
    if (filter === 'videos') return mimeType.startsWith('video/');
    if (filter === 'documents')
        return mimeType.startsWith('application/') || mimeType.startsWith('text/');
    // 'other'
    return (
        !mimeType.startsWith('image/') &&
        !mimeType.startsWith('video/') &&
        !mimeType.startsWith('application/') &&
        !mimeType.startsWith('text/')
    );
}

/**
 * A media original's URL tagged with the record's `updatedAt`. Replacing a file
 * keeps its URL, so without this the browser keeps serving the old bytes.
 */
export function versionedMediaUrl(item: Pick<Media, 'url' | 'updatedAt'>): string {
    const version = new Date(item.updatedAt).getTime();
    if (Number.isNaN(version)) return item.url;
    return `${item.url}${item.url.includes('?') ? '&' : '?'}v=${version}`;
}

export function FileTypeIcon({
    mimeType,
    size = 32,
}: {
    mimeType: string;
    size?: number;
}): React.ReactElement {
    if (mimeType.startsWith('video/')) return <Video size={size} />;
    if (mimeType.startsWith('audio/')) return <Music size={size} />;
    if (mimeType === 'application/pdf' || mimeType.includes('text'))
        return <FileText size={size} />;
    return <File size={size} />;
}
