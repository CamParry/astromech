/**
 * Upload files to the media library, toasting how many went. The library page
 * and the field picker both run it, and render the dialog it opens when a
 * required media field has no default, or when the server refuses the fields.
 */

import type { MediaUploadDialogProps } from '../components/media/media-upload-dialog';
import type { Media } from 'astromech';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { useToast } from '../components/ui/toast';
import { requiresFieldValues } from '../utilities/requires-field-values';
import { mediaMutations } from './media';
import { useAdminMutation } from './use-admin-mutation';
import { readValidationErrors } from './use-fields-form';

export type UseUploadMediaResult = {
    upload: (files: File[]) => void;
    isUploading: boolean;
    /** The props of the `MediaUploadDialog` the caller renders. */
    uploadDialog: MediaUploadDialogProps;
};

/** What the dialog holds: the files waiting on their fields, and why it opened. */
type PendingUpload = { files: File[]; error?: Error };

export function useUploadMedia(): UseUploadMediaResult {
    const { toast } = useToast();
    const { t } = useTranslation();

    const [pending, setPending] = useState<PendingUpload>({ files: [] });

    const toastUploaded = useCallback(
        (uploaded: Media[]) => {
            toast({
                message: t('media.uploadedToast', { count: uploaded.length }),
                variant: 'success',
            });
        },
        [toast, t]
    );

    // This hook reports a failure, a 422 naming fields by opening the dialog.
    const mutation = useAdminMutation(mediaMutations().upload, { toastError: false });
    const { mutate } = mutation;

    const upload = useCallback(
        (files: File[]) => {
            if (files.length === 0) return;
            void (async () => {
                // A check that cannot run asks for the fields rather than skip a required one.
                const needed = await requiresFieldValues(
                    adminConfig.media.fields,
                    'media'
                ).catch(() => true);
                if (needed) {
                    setPending({ files });
                    return;
                }
                const remaining = [...files];
                mutate(
                    {
                        files,
                        onUploaded: (file) => {
                            remaining.splice(remaining.indexOf(file), 1);
                        },
                    },
                    {
                        onSuccess: toastUploaded,
                        onError: (error) => {
                            const uploaded = files.length - remaining.length;
                            const partial =
                                uploaded > 0
                                    ? t('media.uploadedPartialToast', {
                                          uploaded,
                                          total: files.length,
                                      })
                                    : null;
                            // A check only the server runs (a field's `validate`, a
                            // function default) refused the fields: ask for them.
                            const fieldErrors = readValidationErrors(error)?.fields ?? {};
                            if (Object.keys(fieldErrors).length > 0) {
                                setPending({ files: remaining, error });
                                if (partial !== null)
                                    toast({ message: partial, variant: 'warning' });
                                return;
                            }
                            const reason =
                                error.message !== ''
                                    ? error.message
                                    : t('media.uploadFailed');
                            toast({
                                message:
                                    partial === null ? reason : `${partial} ${reason}`,
                                variant: 'error',
                            });
                        },
                    }
                );
            })();
        },
        [mutate, toast, toastUploaded, t]
    );

    return {
        upload,
        isUploading: mutation.isPending,
        uploadDialog: {
            ...pending,
            onClose: () => setPending({ files: [] }),
            onUploaded: toastUploaded,
        },
    };
}
