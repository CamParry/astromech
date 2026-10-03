/**
 * The dialog an upload opens when a required media field has no default, or
 * when the server refuses the fields: one form over the media fields, whose
 * values every file in the upload takes.
 */

import type { JsonObject, Media } from 'astromech';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { mediaMutations } from '../../hooks/media';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
import { useFieldsForm } from '../../hooks/use-fields-form';
import { FieldColumn, FieldsFormProvider } from '../forms/fields-form';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';
import { Stack } from '../ui/page';
import { useToast } from '../ui/toast';

export type MediaUploadDialogProps = {
    /** The files waiting on their fields; the dialog is open while there are any. */
    files: File[];
    /** A refused upload's error, shown on the fields the dialog opens with. */
    error?: Error | undefined;
    onClose: () => void;
    /** Called with the items the last submit uploaded, before the dialog closes. */
    onUploaded: (uploaded: Media[]) => void;
};

export function MediaUploadDialog(
    props: MediaUploadDialogProps
): React.ReactElement | null {
    if (props.files.length === 0) return null;
    // Mounted per upload, so each one starts from an empty form.
    return <MediaUploadForm {...props} />;
}

/** The open dialog. Split out so its form exists only while files wait. */
function MediaUploadForm({
    files,
    error,
    onClose,
    onUploaded,
}: MediaUploadDialogProps): React.ReactElement {
    const { t } = useTranslation();
    const { toast } = useToast();

    // The files still to send. A failed submit drops the ones it uploaded, so
    // a retry sends only the failed file and those after it.
    const [remaining, setRemaining] = useState(files);
    const uploadedFiles = useRef<File[]>([]);

    // The form reports a failed upload, a 422 onto its fields.
    const uploadMutation = useAdminMutation(mediaMutations().upload, {
        toastError: false,
        onError: () => {
            if (uploadedFiles.current.length === 0) return;
            setRemaining(files.filter((file) => !uploadedFiles.current.includes(file)));
            toast({
                message: t('media.uploadedPartialToast', {
                    uploaded: uploadedFiles.current.length,
                    total: files.length,
                }),
                variant: 'warning',
            });
        },
    });

    const uploadForm = useFieldsForm<Record<never, never>, Media[]>({
        fieldDefinitions: adminConfig.media.fields,
        operation: 'create',
        saveHotkey: false,
        initialError: error,
        onSubmit: (values) =>
            uploadMutation.mutateAsync({
                files: remaining,
                fields: values.fields as JsonObject,
                onUploaded: (file) => {
                    uploadedFiles.current.push(file);
                },
            }),
        onSuccess: (uploaded) => {
            onUploaded(uploaded);
            onClose();
        },
    });
    const { mutation, handleSubmit } = uploadForm;
    const isPending = mutation.isPending;

    return (
        <Modal
            open
            onClose={() => {
                if (!isPending) onClose();
            }}
            title={t('media.uploadFieldsTitle', { count: remaining.length })}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={isPending}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant="primary"
                        onClick={() => handleSubmit()}
                        loading={isPending}
                        disabled={isPending}
                    >
                        {t('media.uploadButton')}
                    </Button>
                </>
            }
        >
            <Stack gap={5}>
                <p>
                    {t('media.uploadFieldsDescription', {
                        count: remaining.length,
                        filenames: remaining.map((file) => file.name).join(', '),
                    })}
                </p>
                <FieldsFormProvider form={uploadForm}>
                    <FieldColumn form={uploadForm} />
                </FieldsFormProvider>
            </Stack>
        </Modal>
    );
}
