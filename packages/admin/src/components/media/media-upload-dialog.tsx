/**
 * The dialog an upload opens when a required media field has no default: one
 * form over the media fields, whose values every file in the upload takes.
 */

import type { JsonObject, Media } from 'astromech';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { mediaMutations } from '../../hooks/media';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
import { useFieldsForm } from '../../hooks/use-fields-form';
import { FieldColumn, FieldsFormProvider } from '../forms/fields-form';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';
import { Stack } from '../ui/page';

export type MediaUploadDialogProps = {
    /** The files waiting on their fields; the dialog is open while there are any. */
    files: File[];
    onClose: () => void;
    /** Called with the uploaded items, before the dialog closes. */
    onUploaded: (uploaded: Media[]) => void;
};

export function MediaUploadDialog({
    files,
    onClose,
    onUploaded,
}: MediaUploadDialogProps): React.ReactElement | null {
    if (files.length === 0) return null;
    // Mounted per upload, so each one starts from an empty form.
    return <MediaUploadForm files={files} onClose={onClose} onUploaded={onUploaded} />;
}

/** The open dialog. Split out so its form exists only while files wait. */
function MediaUploadForm({
    files,
    onClose,
    onUploaded,
}: MediaUploadDialogProps): React.ReactElement {
    const { t } = useTranslation();

    // The form reports a failed upload, a 422 onto its fields.
    const uploadMutation = useAdminMutation(mediaMutations().upload, {
        toastError: false,
    });

    const uploadForm = useFieldsForm<Record<never, never>, Media[]>({
        fieldDefinitions: adminConfig.media.fields,
        operation: 'create',
        onSubmit: (values) =>
            uploadMutation.mutateAsync({ files, fields: values.fields as JsonObject }),
        onSuccess: (uploaded) => {
            onUploaded(uploaded);
            onClose();
        },
    });
    const { mutation, handleSubmit } = uploadForm;

    return (
        <Modal
            open
            onClose={onClose}
            title={t('media.uploadFieldsTitle', { count: files.length })}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant="primary"
                        onClick={() => handleSubmit()}
                        loading={mutation.isPending}
                        disabled={mutation.isPending}
                    >
                        {t('media.uploadButton')}
                    </Button>
                </>
            }
        >
            <Stack gap={5}>
                <p>
                    {t('media.uploadFieldsDescription', {
                        count: files.length,
                        filenames: files.map((file) => file.name).join(', '),
                    })}
                </p>
                <FieldsFormProvider form={uploadForm}>
                    <FieldColumn form={uploadForm} />
                </FieldsFormProvider>
            </Stack>
        </Modal>
    );
}
