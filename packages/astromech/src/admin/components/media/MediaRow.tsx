import React from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, Table } from '@/admin/components/ui/index';
import { MediaThumb } from './media-thumb';
import { formatBytes } from '@/utilities/bytes';
import { formatDatetime } from '@/utilities/dates';
import type { Media } from '@/types/index';

export type MediaRowProps = {
    item: Media;
    checked: boolean;
    onToggleCheck: (id: string) => void;
    onClick: (id: string) => void;
};

/** List row. The filename is a real button so the row is reachable by keyboard. */
export function MediaRow({
    item,
    checked,
    onToggleCheck,
    onClick,
}: MediaRowProps): React.ReactElement {
    const { t } = useTranslation();

    return (
        <Table.Row selected={checked} className="am-table-row-clickable">
            <Table.Td className="am-table-checkbox-cell">
                <Checkbox
                    checked={checked}
                    onChange={() => onToggleCheck(item.id)}
                    aria-label={t('media.selectFile', { filename: item.filename })}
                />
            </Table.Td>
            <Table.Td>
                <button
                    type="button"
                    className="am-media-list-row-name"
                    onClick={() => onClick(item.id)}
                >
                    <MediaThumb
                        item={item}
                        width={40}
                        className="am-media-list-row-thumb"
                        iconSize={20}
                    />
                    <span className="am-media-list-row-filename">{item.filename}</span>
                </button>
            </Table.Td>
            <Table.Td className="am-text-mono am-text-xs am-text-muted">
                {item.mimeType}
            </Table.Td>
            <Table.Td>{formatBytes(item.size)}</Table.Td>
            <Table.Td className="am-text-muted am-text-sm">
                {formatDatetime(item.createdAt)}
            </Table.Td>
        </Table.Row>
    );
}
