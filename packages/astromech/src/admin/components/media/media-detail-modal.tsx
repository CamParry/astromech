/**
 * Opens when a media item is clicked in the library: a two-thirds preview
 * with metadata beneath it, a one-third edit column, and footer actions —
 * delete kept apart from cancel/update so it isn't adjacent to either.
 */

import type { Media } from '@/types/index';
import { useForm, useStore } from '@tanstack/react-form';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { defaultContentLocale } from '@/admin/utilities/content-locale';
import { FileTypeIcon, versionedMediaUrl } from '@/admin/utilities/media';
import { formatBytes } from '@/utilities/bytes';
import { formatDatetime } from '@/utilities/dates';
import {
    useDeleteMedia,
    useMediaItem,
    useMediaUsage,
    useReplaceMedia,
    useUpdateMedia,
} from '../../hooks/media';
import { Button } from '../ui/button';
import { useConfirm } from '../ui/confirm';
import { EmptyState } from '../ui/empty-state';
import { Input } from '../ui/input';
import { Modal } from '../ui/modal';
import { Select } from '../ui/select';
import { Spinner } from '../ui/spinner';
import { UploadButton } from '../ui/upload-button';
import { MediaUsagePanel } from './media-usage-panel';
import { MediaVersionsPanel } from './media-versions-panel';

export type MediaDetailModalProps = {
    mediaId: string | null;
    onClose: () => void;
    onDeleted: () => void;
    canDelete?: boolean;
    canUpdate?: boolean;
    canUpload?: boolean;
};

export function MediaDetailModal({
    mediaId,
    onClose,
    onDeleted,
    canDelete = true,
    canUpdate = true,
    canUpload = true,
}: MediaDetailModalProps): React.ReactElement {
    // The modal is addressed by `?item=` alone, so the locale being edited is
    // its own state rather than a search param.
    const [locale, setLocale] = useState(defaultContentLocale);
    const {
        data: item,
        isLoading,
        isError,
    } = useMediaItem(mediaId ?? '', mediaId !== null, locale);
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
                // Keyed on the record and the locale read: one form instance
                // per set of values. Without this a touched form keeps the
                // previous ones and saves them onto the next.
                <MediaDetailBody
                    key={`${item.id}:${item.locale}:${locale}`}
                    item={item}
                    locale={locale}
                    onLocaleChange={setLocale}
                    onClose={onClose}
                    onDeleted={onDeleted}
                    canDelete={canDelete}
                    canUpdate={canUpdate}
                    canUpload={canUpload}
                />
            )}
        </Modal>
    );
}

type MediaDetailBodyProps = {
    item: Media;
    /** The locale being edited, which `item.locale` falls back from. */
    locale: string;
    onLocaleChange: (locale: string) => void;
    onClose: () => void;
    onDeleted: () => void;
    canDelete: boolean;
    canUpdate: boolean;
    canUpload: boolean;
};

/** The loaded modal. Split out so `key` can remount it per media record. */
function MediaDetailBody({
    item,
    locale,
    onLocaleChange,
    onClose,
    onDeleted,
    canDelete,
    canUpdate,
    canUpload,
}: MediaDetailBodyProps): React.ReactElement {
    const { t } = useTranslation();
    const confirm = useConfirm();

    const isTranslatable =
        adminConfig.media.translatable && adminConfig.locales.length > 1;

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
        ...(isTranslatable ? { locale } : {}),
        onSuccess: () => form.reset(form.state.values),
    });

    const deleteMutation = useDeleteMedia({ onSuccess: onDeleted });

    const replaceMutation = useReplaceMedia(item.id);

    // Same query key as the usage panel below, so this reads that cache entry
    // rather than fetching again.
    const { data: usage } = useMediaUsage(item.id);

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

    /**
     * Confirm once the picker has resolved, so the dialog can name the chosen
     * file and how much content is about to serve different bytes.
     */
    function requestReplace(files: File[]): void {
        const file = files[0];
        if (file === undefined) return;

        confirm({
            title: t('media.replaceConfirmTitle'),
            description: t('media.replaceConfirmDescription', {
                filename: file.name,
                count: usage?.length ?? 0,
            }),
            variant: 'danger',
            confirmLabel: t('media.replaceConfirmLabel'),
            onConfirm: () => replaceMutation.mutate(file),
        });
    }

    return (
        <>
            <div className="am-media-modal-layout">
                <div className="am-media-modal-preview-panel">
                    <div className="am-media-modal-preview">
                        {item.mimeType.startsWith('image/') ? (
                            <img
                                src={versionedMediaUrl(item)}
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
                    {isTranslatable && (
                        <div className="am-media-modal-locale">
                            <Select
                                value={locale}
                                onValueChange={(value) => {
                                    if (value !== null) onLocaleChange(value);
                                }}
                                options={localeOptions(item.locales)}
                            />
                            {locale !== item.locale && (
                                <p className="am-text-muted am-text-sm">
                                    {t('media.translationFallbackHint', {
                                        locale: item.locale.toUpperCase(),
                                    })}
                                </p>
                            )}
                        </div>
                    )}

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

                    {/* `item.locale` is the row that was read: a locale with
                        no row has no versions to list. */}
                    <MediaVersionsPanel
                        mediaId={item.id}
                        locale={item.locale}
                        canUpdate={canUpdate}
                    />
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
                    {canUpload && (
                        <UploadButton
                            variant="secondary"
                            size="sm"
                            // A different image format is a valid replacement; a
                            // PDF for a PNG is not.
                            accept={`${item.mimeType.split('/')[0]}/*`}
                            onUpload={requestReplace}
                            loading={replaceMutation.isPending}
                        >
                            {t('media.replaceButton')}
                        </UploadButton>
                    )}
                </div>
                <div className="am-media-modal-actions-end">
                    <Button variant="secondary" size="sm" onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    {canUpdate && (
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

/**
 * Locale options for the modal's switcher: the default first, the rest
 * alphabetical, and a locale with no content row labelled "Add XX".
 */
function localeOptions(itemLocales: string[]): { value: string; label: string }[] {
    // The content default, not `adminConfig.defaultLocale`: that is the
    // admin's display tag (`en-GB`), which need not be a content locale.
    const defaultLocale = defaultContentLocale();
    const { locales } = adminConfig;
    const sorted = [defaultLocale, ...locales.filter((l) => l !== defaultLocale).sort()];
    return sorted.map((loc) => ({
        value: loc,
        label: itemLocales.includes(loc) ? loc.toUpperCase() : `Add ${loc.toUpperCase()}`,
    }));
}
