/**
 * A media thumbnail that requests an image variant rather than the
 * original. Variants come off the media route, generated on demand from
 * the width allowlist and the record's version.
 */

import type { Media } from '@/types/index';
import React from 'react';
import adminConfig from 'virtual:astromech/admin-config';
import { FileTypeIcon, versionedMediaUrl } from '@/admin/utilities/media';
import { buildVariantUrl } from '@/media/serving/image/url.shared';

export type MediaThumbProps = {
    item: Media;
    /** Rendered CSS width in px; the smallest allowlisted variant at or above it wins. */
    width: number;
    className?: string;
    iconSize?: number;
};

export function MediaThumb({
    item,
    width,
    className,
    iconSize,
}: MediaThumbProps): React.ReactElement {
    if (!item.mimeType.startsWith('image/')) {
        return (
            <span className={`${className ?? ''} am-media-thumb-placeholder`.trim()}>
                <FileTypeIcon
                    mimeType={item.mimeType}
                    {...(iconSize ? { size: iconSize } : {})}
                />
            </span>
        );
    }

    const sources = thumbSources(item, width);

    // No variants available (no image driver, no version, or a non-optimisable
    // type) — fall back to the original so the tile still renders.
    if (sources.length === 0) {
        return (
            <img
                src={versionedMediaUrl(item)}
                alt={item.alt ?? ''}
                className={className}
                loading="lazy"
                decoding="async"
            />
        );
    }

    return (
        <picture>
            {sources.map((s) => (
                <source key={s.type} type={s.type} srcSet={s.srcset} />
            ))}
            <img
                src={versionedMediaUrl(item)}
                alt={item.alt ?? ''}
                className={className}
                loading="lazy"
                decoding="async"
            />
        </picture>
    );
}

/** avif/webp `srcset` pairs at 1x and 2x, or [] when no variant can be built. */
function thumbSources(item: Media, width: number): { type: string; srcset: string }[] {
    const version = item.metadata?.version;
    const widths = adminConfig.imageWidths ?? [];
    if (version == null || widths.length === 0) return [];

    const ext = extOf(item.filename);
    const ladder = [pickWidth(widths, width), pickWidth(widths, width * 2)].filter(
        (w, i, a): w is number => w != null && a.indexOf(w) === i
    );
    if (ladder.length === 0) return [];

    const formats = adminConfig.imageAvif ? ['avif', 'webp'] : ['webp'];
    return formats.map((format) => ({
        type: `image/${format}`,
        srcset: ladder
            .map(
                (w) =>
                    `${buildVariantUrl(adminConfig.mediaRoute, item.id, ext, {
                        width: w,
                        format: format as 'avif' | 'webp',
                        version,
                    })} ${w}w`
            )
            .join(', '),
    }));
}

/** Smallest allowlisted width at or above `target`, else the largest available. */
function pickWidth(widths: number[], target: number): number | null {
    if (widths.length === 0) return null;
    const sorted = [...widths].sort((a, b) => a - b);
    return sorted.find((w) => w >= target) ?? sorted[sorted.length - 1] ?? null;
}

function extOf(filename: string): string {
    const dot = filename.lastIndexOf('.');
    return dot >= 0 ? filename.slice(dot + 1) : '';
}
