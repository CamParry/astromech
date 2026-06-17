import React from 'react';
import { File, FileText, Music, Video } from 'lucide-react';
import type { TypeFilter } from '../types/media.js';

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

export function FileTypeIcon({ mimeType, size = 32 }: { mimeType: string; size?: number }): React.ReactElement {
    if (mimeType.startsWith('video/')) return <Video size={size} />;
    if (mimeType.startsWith('audio/')) return <Music size={size} />;
    if (mimeType === 'application/pdf' || mimeType.includes('text'))
        return <FileText size={size} />;
    return <File size={size} />;
}
