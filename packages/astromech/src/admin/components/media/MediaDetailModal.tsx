/**
 * MediaDetailModal
 *
 * Opens when a media item is clicked in the library. A two-thirds preview with
 * the file's metadata beneath it, a one-third edit column, and the actions in
 * a footer — delete separated from cancel/update so the destructive one is not
 * adjacent to the one people aim for.
 */

import React from 'react';
import { useForm, useStore } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Input, Modal, Spinner, useConfirm } from '../ui/index.js';
import { useMediaItem, useUpdateMedia, useDeleteMedia } from '../../hooks/media.js';
import { formatBytes } from '@/utilities/bytes.js';
import { MediaUsagePanel } from './media-usage-panel.js';
import { formatDatetime } from '@/utilities/dates.js';
import { FileTypeIcon } from '@/admin/utilities/media.js';
import type { Media } from '@/types/index.js';

export type MediaDetailModalProps = {
    mediaId: string | null;
    onClose: () => void;
    onDeleted: () => void;
    canDelete?: boolean;
    canUpload?: boolean;
};

export function MediaDetailModal({
    mediaId,
    onClose,
    onDeleted,
    canDelete = true,
    canUpload = true,
}: MediaDetailModalProps): React.ReactElement {
    const {
        data: item,
        isLoading,
        isError,
    } = useMediaItem(mediaId ?? '', mediaId !== null);
    const { t } = useTranslation();

    return (
        <Modal
            open={mediaId !== null}
            onClose={onClose}
            size="lg"
            title={item?.filename ?? ''}
        >
            {isError ? (
                <EmptyState title={t('media.loadFailed')} />
            ) : isLoading || item == null ? (
                <div className="am-media-modal-loading">
                    <Spinner />
                </div>
            ) : (
                // Keyed on the record: one form instance per item. Without this a
                // touched form keeps the previous item's values and saves them
                // onto the next one.
                <MediaDetailBody
                    key={item.id}
                    item={item}
                    onClose={onClose}
                    onDeleted={onDeleted}
                    canDelete={canDelete}
                    canUpload={canUpload}
                />
            )}
        </Modal>
    );
}

type MediaDetailBodyProps = {
    item: Media;
    onClose: () => void;
    onDeleted: () => void;
    canDelete: boolean;
    canUpload: boolean;
};

/** The loaded modal. Split out so `key` can remount it per media record. */
function MediaDetailBody({
    item,
    onClose,
    onDeleted,
    canDelete,
    canUpload,
}: MediaDetailBodyProps): React.ReactElement {
    const { t } = useTranslation();
    const confirm = useConfirm();

    const form = useForm({
        defaultValues: {
            alt: item.alt ?? '',
            title: item.title ?? '',
            caption: item.caption ?? '',
        },
        onSubmit: ({ value }) => {
            updateMutation.mutate(value);
        },
    });

    const updateMutation = useUpdateMedia(item.id, {
        onSuccess: () => form.reset(form.state.values),
    });

    const deleteMutation = useDeleteMedia({ onSuccess: onDeleted });

    // `form.state` is a plain getter — reading it in render never re-renders on
    // change, which left the submit button permanently disabled.
    const isDirty = useStore(form.store, (state) => state.isDirty);

    function requestDelete(): void {
        confirm({
            title: t('media.deleteConfirmLabel'),
            description: t('media.deleteDescription'),
            confirmLabel: t('common.delete'),
            onConfirm: () => deleteMutation.mutate(item.id),
        });
    }

    return (
        <>
            <div className="am-media-modal-layout">
                <div className="am-media-modal-preview-panel">
                    <div className="am-media-modal-preview">
                        {item.mimeType.startsWith('image/') ? (
                            <img
                                src={item.url}
                                alt={item.alt ?? item.filename}
                                className="am-media-modal-preview-image"
                            />
                        ) : (
                            <div className="am-media-modal-preview-icon">
                                <FileTypeIcon mimeType={item.mimeType} size={48} />
                            </div>
                        )}
                    </div>

                    <dl className="am-media-modal-meta-list">
                        <div className="am-media-modal-meta-row">
                            <dt>{t('media.metaSize')}</dt>
                            <dd>{formatBytes(item.size)}</dd>
                        </div>
                        <div className="am-media-modal-meta-row">
                            <dt>{t('media.metaUploaded')}</dt>
                            <dd>{formatDatetime(item.createdAt)}</dd>
                        </div>
                        <div className="am-media-modal-meta-row">
                            <dt>{t('media.metaType')}</dt>
                            <dd className="am-text-mono am-media-modal-mime">
                                {item.mimeType}
                            </dd>
                        </div>
                        {item.width != null && item.height != null && (
                            <div className="am-media-modal-meta-row">
                                <dt>{t('media.metaDimensions')}</dt>
                                <dd>
                                    {item.width} &times; {item.height}
                                </dd>
                            </div>
                        )}
                    </dl>

                    <MediaUsagePanel mediaId={item.id} />
                </div>

                <div className="am-media-modal-form-panel">
                    <form.Field name="alt">
                        {(field) => (
                            <Input
                                id="media-modal-alt"
                                label={t('media.altLabel')}
                                type="text"
                                placeholder={t('media.altPlaceholder')}
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                onBlur={field.handleBlur}
                                hint={t('media.altHint')}
                            />
                        )}
                    </form.Field>

                    <form.Field name="title">
                        {(field) => (
                            <Input
                                id="media-modal-title"
                                label={t('media.titleLabel')}
                                type="text"
                                placeholder={t('media.titlePlaceholder')}
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                onBlur={field.handleBlur}
                            />
                        )}
                    </form.Field>

                    <form.Field name="caption">
                        {(field) => (
                            <Input
                                id="media-modal-caption"
                                label={t('media.captionLabel')}
                                type="text"
                                placeholder={t('media.captionPlaceholder')}
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                onBlur={field.handleBlur}
                            />
                        )}
                    </form.Field>
                </div>
            </div>

            <div className="am-media-modal-actions">
                <div className="am-media-modal-actions-start">
                    {canDelete && (
                        <Button
                            variant="danger"
                            size="sm"
                            onClick={requestDelete}
                            disabled={deleteMutation.isPending}
                        >
                            {t('common.delete')}
                        </Button>
                    )}
                </div>
                <div className="am-media-modal-actions-end">
                    <Button variant="secondary" size="sm" onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    {canUpload && (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => void form.handleSubmit()}
                            disabled={!isDirty}
                            loading={updateMutation.isPending}
                        >
                            {t('media.updateButton')}
                        </Button>
                    )}
                </div>
            </div>
        </>
    );
}
