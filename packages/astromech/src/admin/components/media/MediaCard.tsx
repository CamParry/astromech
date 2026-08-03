import React from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/admin/components/ui/index.js';
import { MediaThumb } from './media-thumb.js';
import type { Media } from '@/types/index.js';

export type MediaCardProps = {
    item: Media;
    checked: boolean;
    onToggleCheck: (id: string) => void;
    onClick: (id: string) => void;
};

/** Grid tile. The checkbox is a sibling of the open button, never nested inside it. */
export function MediaCard({
    item,
    checked,
    onToggleCheck,
    onClick,
}: MediaCardProps): React.ReactElement {
    const { t } = useTranslation();

    return (
        <div className="am-media-card">
            <div className="am-media-card-checkbox">
                <Checkbox
                    checked={checked}
                    onChange={() => onToggleCheck(item.id)}
                    aria-label={t('media.selectFile', { filename: item.filename })}
                />
            </div>

            <button
                type="button"
                className="am-media-card-open"
                onClick={() => onClick(item.id)}
            >
                <MediaThumb
                    item={item}
                    width={220}
                    className="am-media-card-thumb"
                    iconSize={32}
                />
                <span className="am-media-card-meta">
                    <span className="am-media-card-filename">{item.filename}</span>
                </span>
            </button>
        </div>
    );
}
