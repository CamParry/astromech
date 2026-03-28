/**
 * MediaDetailModal
 *
 * Opens when a media item is clicked in the library. Shows a preview on the
 * left and an editable form (alt text, title) on the right.
 */

import React, { useEffect } from 'react';
import { useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { Button, Input, Modal, Spinner, useConfirm } from '../ui/index.js';
import { useMediaItem, useUpdateMedia, useDeleteMedia } from '../../hooks/media.js';
import { formatBytes } from '@/support/bytes.js';
import { formatDatetime } from '@/support/dates.js';
import { FileTypeIcon } from '@/admin/utils/media.js';

export type MediaDetailModalProps = {
    mediaId: string | null;
    onClose: () => void;
    onDeleted: () => void;
    canDelete?: boolean;
    canUpload?: boolean;
};

type FormValues = {
    alt: string;
    title: string;
};

export function MediaDetailModal({
    mediaId,
    onClose,
    onDeleted,
    canDelete = true,
    canUpload = true,
}: MediaDetailModalProps): React.ReactElement {
    const { t } = useTranslation();
    const confirm = useConfirm();

    const { data: item, isLoading } = useMediaItem(mediaId ?? '', mediaId !== null);

    const form = useForm({
        defaultValues: {
            alt: '',
            title: '',
        } satisfies FormValues,
        onSubmit: ({ value }) => {
            updateMutation.mutate({ alt: value.alt });
        },
    });

    useEffect(() => {
        if (item != null) {
            form.reset({
                alt: item.alt ?? '',
                title: '',
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item?.id]);

    const updateMutation = useUpdateMedia(mediaId ?? '', {
        onSuccess: () => form.reset(form.state.values),
    });

    const deleteMutation = useDeleteMedia({
        onSuccess: onDeleted,
    });

    const open = mediaId !== null;

    const headerActions =
        item == null ? null : (
            <>
                {canDelete && (
                    <Button
                        variant="danger"
                        size="sm"
                        onClick={() =>
                            confirm({
                                title: t('media.deleteConfirmLabel'),
                                description: t('media.bulkDeleteDescription'),
                                confirmLabel: t('common.delete'),
                                onConfirm: () => deleteMutation.mutate(mediaId!),
                            })
                        }
                        disabled={deleteMutation.isPending}
                    >
                        {t('common.delete')}
                    </Button>
                )}
                <Button variant="secondary" size="sm" onClick={onClose}>
                    {t('common.cancel')}
                </Button>
                {canUpload && (
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void form.handleSubmit()}
                        disabled={!form.state.isDirty}
                        loading={updateMutation.isPending}
                    >
                        {t('common.save')}
                    </Button>
                )}
            </>
        );

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="lg"
            title={item?.filename ?? ''}
            headerActions={headerActions}
        >
            {isLoading || item == null ? (
                <div className="am-media-modal-loading">
                    <Spinner />
                </div>
            ) : (
                <div className="am-media-modal-layout">
                    {/* Left panel — preview + metadata */}
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

                        <div className="am-media-modal-meta">
                            <p className="am-media-modal-filename">{item.filename}</p>
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
                        </div>
                    </div>

                    {/* Right panel — edit form */}
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
                    </div>
                </div>
            )}
        </Modal>
    );
}
