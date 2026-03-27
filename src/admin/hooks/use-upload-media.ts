import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Astromech } from '../../sdk/fetch/index.js';
import { queryKeys } from './use-query-keys.js';
import { useToast } from '../components/ui/index.js';
import type { Media } from '../../types/index.js';

export type UseUploadMediaResult = {
    upload: (files: File[]) => void;
    isUploading: boolean;
};

export function useUploadMedia(): UseUploadMediaResult {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const mutation = useMutation({
        mutationFn: async (files: File[]) => {
            const results: Media[] = [];
            for (const file of files) {
                const uploaded = await Astromech.media.upload(file);
                results.push(uploaded);
            }
            return results;
        },
        onSuccess: (uploaded) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.media.all() });
            toast({
                message: `${uploaded.length} file${uploaded.length > 1 ? 's' : ''} uploaded.`,
                variant: 'success',
            });
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : 'Upload failed',
                variant: 'error',
            });
        },
    });

    const upload = useCallback(
        (files: File[]) => {
            if (files.length === 0) return;
            mutation.mutate(files);
        },
        [mutation]
    );

    return { upload, isUploading: mutation.isPending };
}
