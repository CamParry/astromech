/**
 * Shared form logic for collection entity create and edit pages.
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
import type { Entity, EntityStatus, JsonObject } from '../../types/index.js';

// ============================================================================
// Types
// ============================================================================

export type EntityFormValues = {
    title: string;
    slug: string;
    status: EntityStatus;
    publishAt: string;
    fields: Record<string, unknown>;
};

export type EntityPayload = {
    title: string;
    slug?: string;
    fields: JsonObject;
    status: EntityStatus;
    publishAt?: Date | null;
};

type UseEntityFormOptions = {
    /** Whether this collection has a slug field. */
    hasSlug: boolean;
    /** Initial form values; defaults to empty/draft. */
    initialValues?: Partial<EntityFormValues>;
    /**
     * The mutation function for the "save" action (save as draft / update).
     * Receives the built payload; must return a Promise<Entity>.
     */
    saveFn: (payload: EntityPayload) => Promise<Entity>;
    /**
     * The mutation function for the "publish" action.
     * Receives the built payload (status forced to 'published'); must return a Promise<Entity>.
     */
    publishFn: (payload: EntityPayload) => Promise<Entity>;
    /** Called after either mutation succeeds, with the returned entity. */
    onSuccess?: (entity: Entity) => void;
};

// ============================================================================
// Hook
// ============================================================================

export function useEntityForm({
    hasSlug,
    initialValues,
    saveFn,
    publishFn,
    onSuccess,
}: UseEntityFormOptions) {
    const { toast } = useToast();

    const form = useForm({
        defaultValues: {
            title: initialValues?.title ?? '',
            slug: initialValues?.slug ?? '',
            status: initialValues?.status ?? ('draft' as EntityStatus),
            publishAt: initialValues?.publishAt ?? '',
            fields: initialValues?.fields ?? ({} as Record<string, unknown>),
        },
        onSubmit: ({ value }) => {
            saveMutation.mutate(buildPayload(value));
        },
    });

    function buildPayload(values: EntityFormValues, overrideStatus?: EntityStatus): EntityPayload {
        const status = overrideStatus ?? values.status;
        const payload: EntityPayload = {
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

    const saveMutation: UseMutationResult<Entity, Error, EntityPayload> = useMutation<
        Entity,
        Error,
        EntityPayload
    >({
        mutationFn: saveFn,
        onSuccess: (entity) => {
            // Reset dirty state without changing values
            form.reset(form.state.values);
            onSuccess?.(entity);
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : 'Save failed',
                variant: 'error',
            });
        },
    });

    const publishMutation: UseMutationResult<Entity, Error, EntityPayload> = useMutation<
        Entity,
        Error,
        EntityPayload
    >({
        mutationFn: publishFn,
        onSuccess: (entity) => {
            form.reset(form.state.values);
            onSuccess?.(entity);
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : 'Publish failed',
                variant: 'error',
            });
        },
    });

    function handleSave(): void {
        void form.handleSubmit();
    }

    function handlePublish(): void {
        publishMutation.mutate(buildPayload(form.state.values, 'published'));
    }

    // Cmd/Ctrl+S — save shortcut. Use a ref so the handler always sees the
    // latest isPending value without requiring the hotkey to re-register.
    const isPendingRef = useRef(saveMutation.isPending);
    isPendingRef.current = saveMutation.isPending;

    useHotkeys('mod+s', () => {
        if (!isPendingRef.current) {
            void form.handleSubmit();
        }
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
    };
}

/** The return type of `useEntityForm`, derived from the hook itself. */
export type UseEntityFormReturn = ReturnType<typeof useEntityForm>;
