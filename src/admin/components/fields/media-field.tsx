import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
import type { BaseFieldProps } from '@/types/index.js';
import { formatValueForInput } from '@/utils/field-formatters';
import { Astromech } from '../../../sdk/client/index.js';
import { queryKeys } from '../../hooks/use-query-keys.js';
import { Modal } from '@/admin/components/ui/modal';
import { Spinner } from '@/admin/components/ui/spinner';
import { UploadZone } from '@/admin/components/ui/upload-zone';
import { useToast } from '@/admin/components/ui/toast';
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
                className={`am-media-picker__thumb ${className}`}
            />
        );
    }
    return (
        <div
            className={`am-media-picker__thumb am-media-picker__thumb--placeholder ${className}`}
        >
            <FileTypeIcon mimeType={item.mimeType} />
        </div>
    );
}

export function MediaField({ name, value, required, field, onChange, disabled }: BaseFieldProps) {
    const { t } = useTranslation();
    const multiple = field.multiple === true;
    const accept = typeof field.accept === 'string' ? field.accept : undefined;
    const queryClient = useQueryClient();
    const { toast } = useToast();

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
    const [isUploading, setIsUploading] = useState(false);
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
        Promise.all(ids.map((id) => Astromech.media.get(id)))
            .then((items) => {
                setSelectedIds(ids);
                setSelectedItems(items.filter(Boolean) as MediaItem[]);
            })
            .catch(() => setError(t('fields.mediaLoadFailed')))
            .finally(() => setIsLoadingItems(false));
    }, [JSON.stringify(value)]);

    const { data: libraryItems, isLoading: libraryLoading } = useQuery({
        queryKey: queryKeys.media.all(),
        queryFn: () => Astromech.media.all(),
        enabled: pickerOpen,
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
        const tempId = newIds[index - 1]!;
        const tempItem = newItems[index - 1]!;
        newIds[index - 1] = newIds[index]!;
        newIds[index] = tempId;
        newItems[index - 1] = newItems[index]!;
        newItems[index] = tempItem;
        setSelectedIds(newIds);
        setSelectedItems(newItems);
        onChange(name, newIds);
    }

    function handleMoveDown(id: string) {
        const index = selectedIds.indexOf(id);
        if (index < 0 || index >= selectedIds.length - 1) return;
        const newIds = [...selectedIds];
        const newItems = [...selectedItems];
        const tempId = newIds[index + 1]!;
        const tempItem = newItems[index + 1]!;
        newIds[index + 1] = newIds[index]!;
        newIds[index] = tempId;
        newItems[index + 1] = newItems[index]!;
        newItems[index] = tempItem;
        setSelectedIds(newIds);
        setSelectedItems(newItems);
        onChange(name, newIds);
    }

    async function handleUpload(files: File[]) {
        setIsUploading(true);
        setError(null);
        for (const file of files) {
            try {
                const media = await Astromech.media.upload(file);
                queryClient.setQueryData<MediaItem[]>(queryKeys.media.all(), (prev) => [
                    media,
                    ...(prev ?? []),
                ]);
                toast({ message: `${file.name} uploaded.`, variant: 'success' });
            } catch (err) {
                toast({ message: `Failed to upload ${file.name}`, variant: 'error' });
            }
        }
        setIsUploading(false);
    }

    const hasSelection = selectedIds.length > 0;

    return (
        <div className="am-media-picker">
            {isLoadingItems ? (
                <Spinner />
            ) : hasSelection ? (
                multiple ? (
                    <div className="am-media-picker__multi-grid">
                        {selectedItems.map((item, index) => (
                            <div key={item.id} className="am-media-picker__multi-item">
                                <MediaThumb item={item} />
                                {!disabled && (
                                    <button
                                        type="button"
                                        className="am-media-picker__multi-remove"
                                        onClick={() => handleRemove(item.id)}
                                        aria-label={t('fields.mediaRemoveItemLabel', {
                                            filename: item.filename,
                                        })}
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                                {!disabled && (
                                    <div className="am-media-picker__multi-reorder">
                                        <button
                                            type="button"
                                            className="am-media-picker__reorder-btn"
                                            onClick={() => handleMoveUp(item.id)}
                                            disabled={index === 0}
                                            aria-label={t('fields.mediaMoveLeft')}
                                        >
                                            <ChevronUp size={12} />
                                        </button>
                                        <button
                                            type="button"
                                            className="am-media-picker__reorder-btn"
                                            onClick={() => handleMoveDown(item.id)}
                                            disabled={index === selectedItems.length - 1}
                                            aria-label={t('fields.mediaMoveRight')}
                                        >
                                            <ChevronDown size={12} />
                                        </button>
                                    </div>
                                )}
                                <span className="am-media-picker__multi-name">
                                    {item.filename}
                                </span>
                            </div>
                        ))}
                        {!disabled && (
                            <button
                                type="button"
                                className="am-media-picker__multi-add"
                                onClick={() => setPickerOpen(true)}
                            >
                                {t('fields.mediaAdd')}
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="am-media-picker__preview">
                        <MediaThumb item={selectedItems[0]!} />
                        {!disabled && (
                            <div className="am-media-picker__overlay">
                                <button
                                    type="button"
                                    className="am-media-picker__overlay-btn"
                                    onClick={() => setPickerOpen(true)}
                                    aria-label={t('fields.mediaChangeLabel')}
                                >
                                    <RefreshCw size={13} />
                                </button>
                                <button
                                    type="button"
                                    className="am-media-picker__overlay-btn am-media-picker__overlay-btn--danger"
                                    onClick={() => handleRemove(selectedIds[0]!)}
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
                    className="am-btn am-btn--secondary am-btn--sm"
                    onClick={() => setPickerOpen(true)}
                >
                    {t('fields.mediaChoose')}
                </button>
            ) : null}

            {error && <p className="am-media-picker__error">{error}</p>}

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
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'flex-end',
                                gap: '0.5rem',
                            }}
                        >
                            <button
                                type="button"
                                className="am-btn am-btn--secondary am-btn--sm"
                                onClick={() => setPickerOpen(false)}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                className="am-btn am-btn--primary am-btn--sm"
                                onClick={() => setPickerOpen(false)}
                            >
                                {selectedIds.length > 0
                                    ? t('common.select', { count: selectedIds.length })
                                    : t('common.done')}
                            </button>
                        </div>
                    ) : undefined
                }
            >
                <div className="am-media-picker__modal-upload">
                    <UploadZone
                        onUpload={handleUpload}
                        disabled={isUploading}
                        label={
                            isUploading
                                ? t('fields.mediaUploading')
                                : t('fields.mediaUploadLabel')
                        }
                        {...(accept !== undefined ? { accept } : {})}
                        multiple
                    />
                </div>
                {libraryLoading ? (
                    <div className="am-media-picker__modal-loading">
                        <Spinner />
                    </div>
                ) : !libraryItems || libraryItems.length === 0 ? (
                    <p className="am-media-picker__modal-empty">
                        {t('fields.mediaNoItems')}
                    </p>
                ) : (
                    <div className="am-media-picker__modal-grid">
                        {libraryItems.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={
                                    'am-media-picker__modal-item' +
                                    (selectedIds.includes(item.id)
                                        ? ' am-media-picker__modal-item--selected'
                                        : '')
                                }
                                onClick={() => handleSelect(item)}
                            >
                                {item.mimeType.startsWith('image/') ? (
                                    <img
                                        src={item.url}
                                        alt={item.alt ?? item.filename}
                                        className="am-media-picker__modal-thumb"
                                    />
                                ) : (
                                    <div className="am-media-picker__modal-thumb am-media-picker__modal-thumb--placeholder">
                                        <FileTypeIcon
                                            mimeType={item.mimeType}
                                            size={24}
                                        />
                                    </div>
                                )}
                                <span className="am-media-picker__modal-name">
                                    {item.filename}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </Modal>
        </div>
    );
}
