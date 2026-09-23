/**
 * Upload files to the media library, toasting how many went. The library page
 * and the field picker both run it.
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/ui/toast';
import { mediaMutations } from './media';
import { useAdminMutation } from './use-admin-mutation';

export type UseUploadMediaResult = {
    upload: (files: File[]) => void;
    isUploading: boolean;
};

export function useUploadMedia(): UseUploadMediaResult {
    const { toast } = useToast();
    const { t } = useTranslation();

    const mutation = useAdminMutation(mediaMutations().upload, {
        onSuccess: (uploaded) => {
            toast({
                message: t('media.uploadedToast', { count: uploaded.length }),
                variant: 'success',
            });
        },
    });
    const { mutate } = mutation;

    const upload = useCallback(
        (files: File[]) => {
            if (files.length === 0) return;
            mutate(files);
        },
        [mutate]
    );

    return { upload, isUploading: mutation.isPending };
}
