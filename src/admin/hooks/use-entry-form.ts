/**
 * Shared form logic for collection entry create and edit pages.
 *
 * Owns: useForm setup, buildPayload, save/publish mutations, Cmd+S shortcut,
 * beforeunload dirty-state guard, and toast error handling.
 *
 * The caller supplies `saveFn` / `publishFn` as the actual SDK calls so that
 * create and edit can use different endpoints while sharing everything else.
 */

import { useEffect, useRef } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { useHotkeys } from './index.js';
import { useToast } from '../components/ui/index.js';
import type { Entry, EntryStatus, JsonObject } from '../../types/index.js';

// ============================================================================
// Types
// ============================================================================

export type EntryFormValues = {
    title: string;
    slug: string;
    status: EntryStatus;
    publishAt: string;
    fields: Record<string, unknown>;
};

export type EntryPayload = {
    title: string;
    slug?: string;
    fields: JsonObject;
    status: EntryStatus;
    publishAt?: Date | null;
};

type UseEntryFormOptions = {
    /** Whether this collection has a slug field. */
    hasSlug: boolean;
    /** Initial form values; defaults to empty/draft. */
    defaultValues?: Partial<EntryFormValues>;
    /**
     * The mutation function for the "save" action (save as draft / update).
     * Receives the built payload; must return a Promise<Entry>.
     */
    saveFn: (payload: EntryPayload) => Promise<Entry>;
    /**
     * The mutation function for the "publish" action.
     * Receives the built payload (status forced to 'published'); must return a Promise<Entry>.
     */
    publishFn: (payload: EntryPayload) => Promise<Entry>;
    /** Called after either mutation succeeds, with the returned entry. */
    onSuccess?: (entry: Entry) => void;
    /** When true, save and publish actions become no-ops. */
    readOnly?: boolean;
};

// ============================================================================
// Hook
// ============================================================================

export function useEntryForm({
    hasSlug,
    defaultValues,
    saveFn,
    publishFn,
    onSuccess,
    readOnly = false,
}: UseEntryFormOptions) {
    const { toast } = useToast();

    const form = useForm({
        defaultValues: {
            title: defaultValues?.title ?? '',
            slug: defaultValues?.slug ?? '',
            status: defaultValues?.status ?? ('draft' as EntryStatus),
            publishAt: defaultValues?.publishAt ?? '',
            fields: defaultValues?.fields ?? ({} as Record<string, unknown>),
        },
        onSubmit: ({ value }) => {
            saveMutation.mutate(buildPayload(value));
        },
    });

    function buildPayload(
        values: EntryFormValues,
        overrideStatus?: EntryStatus
    ): EntryPayload {
        const status = overrideStatus ?? values.status;
        const payload: EntryPayload = {
            title: values.title,
            fields: values.fields as JsonObject,
            status,
        };
        if (hasSlug && values.slug.trim()) {
            payload.slug = values.slug.trim();
        }
        if (status === 'scheduled' && values.publishAt) {
            payload.publishAt = new Date(values.publishAt);
        }
        return payload;
    }

    const saveMutation: UseMutationResult<Entry, Error, EntryPayload> = useMutation<
        Entry,
        Error,
        EntryPayload
    >({
        mutationFn: saveFn,
        onSuccess: (entry) => {
            // Reset dirty state without changing values
            form.reset(form.state.values);
            onSuccess?.(entry);
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : 'Save failed',
                variant: 'error',
            });
        },
    });

    const publishMutation: UseMutationResult<Entry, Error, EntryPayload> = useMutation<
        Entry,
        Error,
        EntryPayload
    >({
        mutationFn: publishFn,
        onSuccess: (entry) => {
            form.reset(form.state.values);
            onSuccess?.(entry);
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : 'Publish failed',
                variant: 'error',
            });
        },
    });

    function handleSave(): void {
        if (readOnly) return;
        void form.handleSubmit();
    }

    function handlePublish(): void {
        if (readOnly) return;
        publishMutation.mutate(buildPayload(form.state.values, 'published'));
    }

    // Cmd/Ctrl+S — save shortcut. Use a ref so the handler always sees the
    // latest isPending value without requiring the hotkey to re-register.
    const isPendingRef = useRef(saveMutation.isPending);
    isPendingRef.current = saveMutation.isPending;

    useHotkeys('mod+s', () => {
        if (readOnly || isPendingRef.current) return;
        void form.handleSubmit();
    });

    // Warn on browser tab close when there are unsaved changes
    useEffect(() => {
        function handleBeforeUnload(e: BeforeUnloadEvent): void {
            if (!form.state.isDirty) return;
            e.preventDefault();
        }
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
        // form is stable; isDirty is read via the ref on the stable form object
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        form,
        saveMutation,
        publishMutation,
        handleSave,
        handlePublish,
        buildPayload,
        readOnly,
    };
}

/** The return type of `useEntryForm`, derived from the hook itself. */
export type UseEntryFormReturn = ReturnType<typeof useEntryForm>;
