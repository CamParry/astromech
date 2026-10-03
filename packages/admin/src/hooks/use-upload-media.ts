/**
 * Upload files to the media library, toasting how many went. The library page
 * and the field picker both run it, and render the dialog it opens when a
 * required media field has no default.
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

export type UseUploadMediaResult = {
    upload: (files: File[]) => void;
    isUploading: boolean;
    /** The props of the `MediaUploadDialog` the caller renders. */
    uploadDialog: MediaUploadDialogProps;
};

export function useUploadMedia(): UseUploadMediaResult {
    const { toast } = useToast();
    const { t } = useTranslation();

    // The files the dialog holds while the author fills in the media fields.
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);

    const toastUploaded = useCallback(
        (uploaded: Media[]) => {
            toast({
                message: t('media.uploadedToast', { count: uploaded.length }),
                variant: 'success',
            });
        },
        [toast, t]
    );

    const mutation = useAdminMutation(mediaMutations().upload, {
        onSuccess: toastUploaded,
    });
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
                if (needed) setPendingFiles(files);
                else mutate({ files });
            })();
        },
        [mutate]
    );

    return {
        upload,
        isUploading: mutation.isPending,
        uploadDialog: {
            files: pendingFiles,
            onClose: () => setPendingFiles([]),
            onUploaded: toastUploaded,
        },
    };
}
