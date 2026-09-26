import type { Media } from 'astromech';
import { File, FileText, Music, Video } from 'lucide-react';
import React from 'react';

/**
 * A media original's URL tagged with the file's content hash (`metadata.version`),
 * or with `updatedAt` for a file that has none. Replacing a file keeps its URL,
 * so without the tag the browser keeps serving the old bytes.
 */
export function versionedMediaUrl(
    item: Pick<Media, 'url' | 'updatedAt' | 'metadata'>
): string {
    const version = item.metadata?.version ?? fallbackVersion(item.updatedAt);
    if (version === undefined) return item.url;
    return `${item.url}${item.url.includes('?') ? '&' : '?'}v=${version}`;
}

/** `updatedAt` as epoch milliseconds, or undefined when it doesn't parse. */
function fallbackVersion(updatedAt: Date): string | undefined {
    const time = new Date(updatedAt).getTime();
    return Number.isNaN(time) ? undefined : String(time);
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
