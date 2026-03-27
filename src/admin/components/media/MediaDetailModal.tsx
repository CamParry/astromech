/**
 * MediaDetailModal
 *
 * Opens when a media item is clicked in the library. Shows a preview on the
 * left and an editable form (alt text, title) on the right.
 */

import React, { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { Button, Input, Modal, Spinner, useConfirm, useToast } from '../ui/index.js';
import { Astromech } from '../../../sdk/client/index.js';
import { queryKeys } from '../../hooks/use-query-keys.js';
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
    const { toast } = useToast();
    const confirm = useConfirm();
    const queryClient = useQueryClient();

    const { data: item, isLoading } = useQuery({
        queryKey: queryKeys.media.detail(mediaId ?? ''),
        queryFn: () => Astromech.media.get(mediaId!),
        enabled: mediaId !== null,
    });

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

    const updateMutation = useMutation({
        mutationFn: (data: { alt: string }) => Astromech.media.update(mediaId!, data),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.media.detail(mediaId!),
            });
            void queryClient.invalidateQueries({ queryKey: queryKeys.media.all() });
            form.reset(form.state.values);
            toast({ message: t('media.saved'), variant: 'success' });
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('media.saveFailed'),
                variant: 'error',
            });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: () => Astromech.media.delete(mediaId!),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.media.all() });
            toast({ message: t('media.deleted'), variant: 'success' });
            onDeleted();
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('media.deleteFailed'),
                variant: 'error',
            });
        },
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
                                onConfirm: () => deleteMutation.mutate(),
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
                <div className="am-media-modal__loading">
                    <Spinner />
                </div>
            ) : (
                <div className="am-media-modal__layout">
                    {/* Left panel — preview + metadata */}
                    <div className="am-media-modal__preview-panel">
                        <div className="am-media-modal__preview">
                            {item.mimeType.startsWith('image/') ? (
                                <img
                                    src={item.url}
                                    alt={item.alt ?? item.filename}
                                    className="am-media-modal__preview-image"
                                />
                            ) : (
                                <div className="am-media-modal__preview-icon">
                                    <FileTypeIcon mimeType={item.mimeType} size={48} />
                                </div>
                            )}
                        </div>

                        <div className="am-media-modal__meta">
                            <p className="am-media-modal__filename">{item.filename}</p>
                            <dl className="am-media-modal__meta-list">
                                <div className="am-media-modal__meta-row">
                                    <dt>{t('media.metaSize')}</dt>
                                    <dd>{formatBytes(item.size)}</dd>
                                </div>
                                <div className="am-media-modal__meta-row">
                                    <dt>{t('media.metaUploaded')}</dt>
                                    <dd>{formatDatetime(item.createdAt)}</dd>
                                </div>
                                <div className="am-media-modal__meta-row">
                                    <dt>{t('media.metaType')}</dt>
                                    <dd className="am-text-mono am-media-modal__mime">
                                        {item.mimeType}
                                    </dd>
                                </div>
                                {item.width != null && item.height != null && (
                                    <div className="am-media-modal__meta-row">
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
                    <div className="am-media-modal__form-panel">
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
