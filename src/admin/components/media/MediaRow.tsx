import React from 'react';
import { Checkbox, Table } from '../ui/index.js';
import { FileTypeIcon } from '../../utils/media.js';
import { formatBytes } from '@/support/bytes.js';
import { formatDatetime } from '@/support/dates.js';
import type { Media } from '../../../types/index.js';

export type MediaRowProps = {
    item: Media;
    checked: boolean;
    onToggleCheck: (id: string) => void;
    onClick: (id: string) => void;
};

export function MediaRow({ item, checked, onToggleCheck, onClick }: MediaRowProps): React.ReactElement {
    return (
        <Table.Row
            selected={checked}
            onClick={() => onClick(item.id)}
            className="am-table-row--clickable"
        >
            <Table.Td onClick={(e) => e.stopPropagation()} className="am-table__checkbox-cell">
                <Checkbox
                    checked={checked}
                    onChange={() => onToggleCheck(item.id)}
                />
            </Table.Td>
            <Table.Td>
                <div className="am-media-list-row__name">
                    {item.mimeType.startsWith('image/') ? (
                        <img
                            src={item.url}
                            alt={item.alt ?? item.filename}
                            className="am-media-list-row__thumb"
                        />
                    ) : (
                        <span className="am-media-list-row__icon">
                            <FileTypeIcon mimeType={item.mimeType} size={20} />
                        </span>
                    )}
                    <span className="am-media-list-row__filename">{item.filename}</span>
                </div>
            </Table.Td>
            <Table.Td className="am-text-mono am-text-xs am-text-muted">{item.mimeType}</Table.Td>
            <Table.Td>{formatBytes(item.size)}</Table.Td>
            <Table.Td className="am-text-muted am-text-sm">{formatDatetime(item.createdAt)}</Table.Td>
        </Table.Row>
    );
}
