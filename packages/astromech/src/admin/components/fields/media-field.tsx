import type { MediaBrowserQuery } from '@/admin/types/media';
import type { BaseFieldProps } from '@/types/index';
import {
    ChevronDown,
    ChevronUp,
    File,
    FileText,
    Music,
    RefreshCw,
    Video,
    X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFieldControl } from '@/admin/components/fields/field-control-context';
import { MediaPicker } from '@/admin/components/media/media-picker';
import { Modal } from '@/admin/components/ui/modal';
import { Spinner } from '@/admin/components/ui/spinner';
import { astromechClient } from '@/transport/http/client/index';
import './media-field.css';

type MediaItem = {
    id: string;
    url: string;
    filename: string;
    mimeType: string;
    size: number;
    alt?: string | null;
};

function FileTypeIcon({ mimeType, size = 28 }: { mimeType: string; size?: number }) {
    if (mimeType.startsWith('video/')) return <Video size={size} />;
    if (mimeType.startsWith('audio/')) return <Music size={size} />;
    if (mimeType === 'application/pdf' || mimeType.includes('text'))
        return <FileText size={size} />;
    return <File size={size} />;
}

function MediaThumb({ item, className = '' }: { item: MediaItem; className?: string }) {
    if (item.mimeType.startsWith('image/')) {
        return (
            <img
                src={item.url}
                alt={item.alt ?? item.filename}
                className={`am-media-picker-thumb ${className}`}
            />
        );
    }
    return (
        <div
            className={`am-media-picker-thumb am-media-picker-thumb-placeholder ${className}`}
        >
            <FileTypeIcon mimeType={item.mimeType} />
        </div>
    );
}

export function MediaField({
    name,
    value,
    required,
    field,
    onChange,
    disabled,
}: BaseFieldProps) {
    const { hasError } = useFieldControl();
    const { t } = useTranslation();
    const multiple = field.multiple === true;
    const accept = typeof field.accept === 'string' ? field.accept : undefined;

    // For single: value is a string id or null
    // For multiple: value is an array of string ids
    const initialIds: string[] = multiple
        ? Array.isArray(value)
            ? (value as string[])
            : []
        : typeof value === 'string' && value
          ? [value]
          : [];

    const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
    const [selectedItems, setSelectedItems] = useState<MediaItem[]>([]);
    const [isLoadingItems, setIsLoadingItems] = useState(initialIds.length > 0);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load existing selected items
    useEffect(() => {
        const ids = multiple
            ? Array.isArray(value)
                ? (value as string[])
                : []
            : typeof value === 'string' && value
              ? [value]
              : [];

        if (ids.length === 0) {
            setSelectedIds([]);
            setSelectedItems([]);
            setIsLoadingItems(false);
            return;
        }

        setIsLoadingItems(true);
        Promise.all(ids.map((id) => astromechClient.media.get({ id })))
            .then((items) => {
                setSelectedIds(ids);
                setSelectedItems(items.filter(Boolean) as MediaItem[]);
            })
            .catch(() => setError(t('fields.mediaLoadFailed')))
            .finally(() => setIsLoadingItems(false));
    }, [JSON.stringify(value)]);

    const [pickerQuery, setPickerQuery] = useState<MediaBrowserQuery>({
        q: '',
        type: 'all',
        page: 1,
    });

    function handleSelect(item: MediaItem) {
        if (multiple) {
            const alreadySelected = selectedIds.includes(item.id);
            if (alreadySelected) {
                const newIds = selectedIds.filter((id) => id !== item.id);
                const newItems = selectedItems.filter((i) => i.id !== item.id);
                setSelectedIds(newIds);
                setSelectedItems(newItems);
                onChange(name, newIds);
            } else {
                const newIds = [...selectedIds, item.id];
                const newItems = [...selectedItems, item];
                setSelectedIds(newIds);
                setSelectedItems(newItems);
                onChange(name, newIds);
            }
        } else {
            setSelectedIds([item.id]);
            setSelectedItems([item]);
            onChange(name, item.id);
            setPickerOpen(false);
        }
    }

    function handleRemove(id: string) {
        const newIds = selectedIds.filter((i) => i !== id);
        const newItems = selectedItems.filter((i) => i.id !== id);
        setSelectedIds(newIds);
        setSelectedItems(newItems);
        onChange(name, multiple ? newIds : null);
    }

    function handleMoveUp(id: string) {
        const index = selectedIds.indexOf(id);
        if (index <= 0) return;
        const newIds = [...selectedIds];
        const newItems = [...selectedItems];
        const prevId = newIds[index - 1];
        const prevItem = newItems[index - 1];
        const curId = newIds[index];
        const curItem = newItems[index];
        if (
            prevId === undefined ||
            prevItem === undefined ||
            curId === undefined ||
            curItem === undefined
        )
            return;
        newIds[index - 1] = curId;
        newIds[index] = prevId;
        newItems[index - 1] = curItem;
        newItems[index] = prevItem;
        setSelectedIds(newIds);
        setSelectedItems(newItems);
        onChange(name, newIds);
    }

    function handleMoveDown(id: string) {
        const index = selectedIds.indexOf(id);
        if (index < 0 || index >= selectedIds.length - 1) return;
        const newIds = [...selectedIds];
        const newItems = [...selectedItems];
        const nextId = newIds[index + 1];
        const nextItem = newItems[index + 1];
        const curId = newIds[index];
        const curItem = newItems[index];
        if (
            nextId === undefined ||
            nextItem === undefined ||
            curId === undefined ||
            curItem === undefined
        )
            return;
        newIds[index + 1] = curId;
        newIds[index] = nextId;
        newItems[index + 1] = curItem;
        newItems[index] = nextItem;
        setSelectedIds(newIds);
        setSelectedItems(newItems);
        onChange(name, newIds);
    }

    const hasSelection = selectedIds.length > 0;

    return (
        <div className="am-media-picker">
            {isLoadingItems ? (
                <Spinner />
            ) : hasSelection ? (
                multiple ? (
                    <div className="am-media-picker-multi-grid">
                        {selectedItems.map((item, index) => (
                            <div key={item.id} className="am-media-picker-multi-item">
                                <MediaThumb item={item} />
                                {!disabled && (
                                    <button
                                        type="button"
                                        className="am-media-picker-multi-remove"
                                        onClick={() => handleRemove(item.id)}
                                        aria-label={t('fields.mediaRemoveItemLabel', {
                                            filename: item.filename,
                                        })}
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                                {!disabled && (
                                    <div className="am-media-picker-multi-reorder">
                                        <button
                                            type="button"
                                            className="am-media-picker-reorder-btn"
                                            onClick={() => handleMoveUp(item.id)}
                                            disabled={index === 0}
                                            aria-label={t('fields.mediaMoveLeft')}
                                        >
                                            <ChevronUp size={12} />
                                        </button>
                                        <button
                                            type="button"
                                            className="am-media-picker-reorder-btn"
                                            onClick={() => handleMoveDown(item.id)}
                                            disabled={index === selectedItems.length - 1}
                                            aria-label={t('fields.mediaMoveRight')}
                                        >
                                            <ChevronDown size={12} />
                                        </button>
                                    </div>
                                )}
                                <span className="am-media-picker-multi-name">
                                    {item.filename}
                                </span>
                            </div>
                        ))}
                        {!disabled && (
                            <button
                                type="button"
                                className="am-media-picker-multi-add"
                                onClick={() => setPickerOpen(true)}
                            >
                                {t('fields.mediaAdd')}
                            </button>
                        )}
                    </div>
                ) : selectedItems[0] === undefined ? null : (
                    <div className="am-media-picker-preview">
                        <MediaThumb item={selectedItems[0]} />
                        {!disabled && (
                            <div className="am-media-picker-overlay">
                                <button
                                    type="button"
                                    className="am-media-picker-overlay-btn"
                                    onClick={() => setPickerOpen(true)}
                                    aria-label={t('fields.mediaChangeLabel')}
                                >
                                    <RefreshCw size={13} />
                                </button>
                                <button
                                    type="button"
                                    className="am-media-picker-overlay-btn am-media-picker-overlay-btn-danger"
                                    onClick={() => handleRemove(selectedIds[0] as string)}
                                    aria-label={t('fields.mediaRemoveLabel')}
                                >
                                    <X size={13} />
                                </button>
                            </div>
                        )}
                    </div>
                )
            ) : !disabled ? (
                <button
                    type="button"
                    className="am-btn am-btn-secondary am-btn-sm"
                    onClick={() => setPickerOpen(true)}
                >
                    {t('fields.mediaChoose')}
                </button>
            ) : null}

            {!hasError && error && <p className="am-field-error">{error}</p>}

            <input
                type="hidden"
                name={name}
                value={multiple ? selectedIds.join(',') : (selectedIds[0] ?? '')}
                required={required}
            />

            <Modal
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                title={t('fields.mediaLibraryTitle')}
                size="lg"
                footer={
                    multiple ? (
                        <>
                            <button
                                type="button"
                                className="am-btn am-btn-secondary am-btn-sm"
                                onClick={() => setPickerOpen(false)}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                className="am-btn am-btn-primary am-btn-sm"
                                onClick={() => setPickerOpen(false)}
                            >
                                {selectedIds.length > 0
                                    ? t('common.select', { count: selectedIds.length })
                                    : t('common.done')}
                            </button>
                        </>
                    ) : undefined
                }
            >
                <MediaPicker
                    query={pickerQuery}
                    onQueryChange={(next) =>
                        setPickerQuery((prev) => ({ ...prev, ...next }))
                    }
                    selectedIds={selectedIds}
                    onPick={handleSelect}
                    multiple={multiple}
                    {...(accept !== undefined ? { accept } : {})}
                />
            </Modal>
        </div>
    );
}
