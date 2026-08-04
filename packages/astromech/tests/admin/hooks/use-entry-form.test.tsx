/**
 * @vitest-environment happy-dom
 *
 * Save and publish must be the SAME submit path.
 *
 * `handleSave` always went through `form.handleSubmit()`, so TanStack's own
 * per-field validators ran — including the "title is required" one the entry
 * pages register on `form.Field name="title"`. `handlePublish` used to call the
 * publish mutation directly, so an entry could be published with an empty title
 * even though saving one was refused.
 *
 * There is no `@testing-library/react` here, so this drives a real React root
 * directly (same approach as use-field-validation.test.tsx).
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import React, { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ToastProvider } from '@/admin/components/ui/toast';
import { useEntryForm } from '@/admin/hooks/use-entry-form.js';
import type { UseEntryFormReturn } from '@/admin/hooks/use-entry-form.js';
import type { Entry, Field } from '@/types/index.js';

beforeAll(async () => {
    // The hook reads labels through `useTranslation`; the SPA's own i18n module
    // pulls in virtual modules, so stand up a bare instance instead.
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: {} } },
    });
});

const FIELDS: Field[] = [{ name: 'body', type: 'text', label: 'Body', required: true }];

function entry(id: string): Entry {
    return { id } as Entry;
}

type Mounted = {
    handle: () => UseEntryFormReturn;
    saveFn: ReturnType<typeof vi.fn>;
    publishFn: ReturnType<typeof vi.fn>;
    unmount: () => void;
};

/**
 * Mount the hook with a `title` field carrying the same required-validator the
 * entry pages register, plus one required entry field.
 */
function mountForm(defaults: {
    title: string;
    fields: Record<string, unknown>;
}): Mounted {
    const saveFn = vi.fn(async () => entry('saved'));
    const publishFn = vi.fn(async () => entry('published'));
    let latest: UseEntryFormReturn | undefined;

    function Probe(): React.ReactElement {
        const result = useEntryForm({
            fieldDefinitions: FIELDS,
            operation: 'create',
            namespace: 'translation',
            hasSlug: false,
            defaultValues: { title: defaults.title, fields: defaults.fields },
            saveFn,
            publishFn,
        });
        latest = result;
        const { form } = result;
        // The field has to be MOUNTED for `handleSubmit` to run its validator.
        return (
            <form.Field
                name="title"
                validators={{
                    onChange: ({ value }: { value: string }) =>
                        value.trim() === '' ? 'Title is required' : undefined,
                }}
            >
                {(field) => <input value={field.state.value} readOnly />}
            </form.Field>
        );
    }

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
        root.render(
            <QueryClientProvider client={new QueryClient()}>
                <ToastProvider>
                    <Probe />
                </ToastProvider>
            </QueryClientProvider>
        );
    });

    return {
        handle: () => {
            if (latest === undefined) throw new Error('the probe never rendered');
            return latest;
        },
        saveFn,
        publishFn,
        unmount: () => {
            act(() => root.unmount());
            host.remove();
        },
    };
}

/** Let the submit (and the mutation it fires) settle. */
async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

// ============================================================================
// Publish runs the title validator
// ============================================================================

describe('handlePublish', () => {
    it('does not fire the publish mutation when the title is empty', async () => {
        const mounted = mountForm({ title: '', fields: { body: 'written' } });

        act(() => mounted.handle().handlePublish());
        await settle();

        expect(mounted.publishFn).not.toHaveBeenCalled();
        expect(mounted.saveFn).not.toHaveBeenCalled();

        mounted.unmount();
    });

    it('fires the publish mutation when the title and fields are valid', async () => {
        const mounted = mountForm({ title: 'Ready', fields: { body: 'written' } });

        act(() => mounted.handle().handlePublish());
        await settle();

        expect(mounted.publishFn).toHaveBeenCalledTimes(1);
        expect(mounted.publishFn.mock.calls[0]?.[0]).toMatchObject({
            title: 'Ready',
            status: 'published',
        });
        expect(mounted.saveFn).not.toHaveBeenCalled();

        mounted.unmount();
    });

    it('still refuses when the title is fine but a required field is empty', async () => {
        const mounted = mountForm({ title: 'Ready', fields: { body: '' } });

        act(() => mounted.handle().handlePublish());
        await settle();

        expect(mounted.publishFn).not.toHaveBeenCalled();

        mounted.unmount();
    });

    it('leaves a following save unpublished (the publish intent is cleared)', async () => {
        const mounted = mountForm({ title: 'Ready', fields: { body: 'written' } });

        act(() => mounted.handle().handlePublish());
        await settle();
        act(() => mounted.handle().handleSave());
        await settle();

        expect(mounted.publishFn).toHaveBeenCalledTimes(1);
        expect(mounted.saveFn).toHaveBeenCalledTimes(1);
        expect(mounted.saveFn.mock.calls[0]?.[0]).toMatchObject({
            status: 'unpublished',
        });

        mounted.unmount();
    });
});

// ============================================================================
// Save is unchanged
// ============================================================================

describe('handleSave', () => {
    it('does not fire the save mutation when the title is empty', async () => {
        const mounted = mountForm({ title: '', fields: { body: 'written' } });

        act(() => mounted.handle().handleSave());
        await settle();

        expect(mounted.saveFn).not.toHaveBeenCalled();

        mounted.unmount();
    });

    it('saves an incomplete entry — completeness is publish-only', async () => {
        const mounted = mountForm({ title: 'Draft', fields: { body: '' } });

        act(() => mounted.handle().handleSave());
        await settle();

        expect(mounted.saveFn).toHaveBeenCalledTimes(1);
        expect(mounted.publishFn).not.toHaveBeenCalled();

        mounted.unmount();
    });
});
