import React from 'react';
import { Checkbox } from '../ui/index.js';
import { FileTypeIcon } from '../../utils/media.js';
import { formatBytes } from '@/support/bytes.js';
import type { Media } from '../../../types/index.js';

export type MediaCardProps = {
    item: Media;
    checked: boolean;
    onToggleCheck: (id: string) => void;
    onClick: (id: string) => void;
};

export function MediaCard({ item, checked, onToggleCheck, onClick }: MediaCardProps): React.ReactElement {
    return (
        <div
            className="am-media-card"
            onClick={() => onClick(item.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(item.id); }}
        >
            <div
                className="am-media-card__checkbox"
                onClick={(e) => e.stopPropagation()}
            >
                <Checkbox
                    checked={checked}
                    onChange={() => onToggleCheck(item.id)}
                />
            </div>

            {item.mimeType.startsWith('image/') ? (
                <img
                    src={item.url}
                    alt={item.alt ?? item.filename}
                    className="am-media-card__thumb"
                />
            ) : (
                <div className="am-media-card__thumb am-media-card__thumb--placeholder">
                    <FileTypeIcon mimeType={item.mimeType} />
                </div>
            )}

            <div className="am-media-card__meta">
                <p className="am-media-card__filename">{item.filename}</p>
                <p className="am-media-card__size">{formatBytes(item.size)}</p>
            </div>
        </div>
    );
}
