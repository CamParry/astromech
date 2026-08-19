import type { Media } from '@/types/index';
import { Check } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/admin/components/ui/index';
import { MediaThumb } from './media-thumb';

export type MediaCardProps = {
    item: Media;
    onClick: (id: string) => void;
    /** Bulk mode: renders the selection checkbox. Omit in picker mode. */
    checked?: boolean;
    onToggleCheck?: (id: string) => void;
    /** Picker mode: the tile itself is the selection, marked with a tick. */
    selected?: boolean;
};

/** Grid tile. The checkbox is a sibling of the open button, never nested inside it. */
export function MediaCard({
    item,
    onClick,
    checked,
    onToggleCheck,
    selected,
}: MediaCardProps): React.ReactElement {
    const { t } = useTranslation();
    const showCheckbox = onToggleCheck !== undefined;

    return (
        <div className={`am-media-card${selected ? ' am-media-card-selected' : ''}`}>
            {showCheckbox && (
                <div className="am-media-card-checkbox">
                    <Checkbox
                        checked={checked ?? false}
                        onChange={() => onToggleCheck(item.id)}
                        aria-label={t('media.selectFile', { filename: item.filename })}
                    />
                </div>
            )}

            {selected && (
                <span className="am-media-card-tick" aria-hidden="true">
                    <Check size={14} />
                </span>
            )}

            <button
                type="button"
                className="am-media-card-open"
                onClick={() => onClick(item.id)}
                aria-pressed={selected}
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
