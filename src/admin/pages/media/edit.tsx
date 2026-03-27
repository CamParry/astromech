/**
 * Media edit page.
 *
 * Shows preview, alt text input, and metadata sidebar.
 * Save calls PUT /media/:id, delete calls DELETE /media/:id.
 */

import React, { useEffect } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { FileImage } from 'lucide-react';
import {
    Button,
    Panel,
    Breadcrumb,
    Input,
    PageLoading,
    useToast,
    useConfirm,
    Page,
    PageHeader,
    FormLayout,
    FormLayoutMain,
    FormLayoutSidebar,
} from '../../components/ui/index.js';
import { Astromech } from '../../../sdk/fetch/index.js';
import { queryKeys } from '../../hooks/use-query-keys.js';
import { usePermissions } from '../../hooks/index.js';

// ============================================================================
// Helpers
// ============================================================================

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: Date | string | null | undefined): string {
    if (value == null) return '—';
    return new Date(value).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

// ============================================================================
// Types
// ============================================================================

type FormValues = {
    alt: string;
};

// ============================================================================
// Page
// ============================================================================

export function MediaEditPage(): React.ReactElement {
    const { id } = useParams({ strict: false }) as { id: string };
    const { canUploadMedia, canDeleteMedia } = usePermissions();
    const { toast } = useToast();
    const confirm = useConfirm();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const form = useForm({
        defaultValues: {
            alt: '',
        } satisfies FormValues,
        onSubmit: ({ value }) => {
            updateMutation.mutate({ alt: value.alt });
        },
    });

    const { data: item, isLoading } = useQuery({
        queryKey: queryKeys.media.detail(id),
        queryFn: () => Astromech.media.get(id),
    });

    useEffect(() => {
        if (item != null) {
            form.reset({ alt: item.alt ?? '' });
        }
        // form is stable; item is the only reactive dep
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item]);

    const updateMutation = useMutation({
        mutationFn: (data: { alt: string }) => Astromech.media.update(id, data),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.media.detail(id) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.media.all() });
            form.reset(form.state.values);
            toast({ message: 'Media updated.', variant: 'success' });
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : 'Save failed',
                variant: 'error',
            });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: () => Astromech.media.delete(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.media.all() });
            toast({ message: 'Media deleted.', variant: 'success' });
            void navigate({ to: '/media' });
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : 'Delete failed',
                variant: 'error',
            });
        },
    });

    function handleSave() {
        void form.handleSubmit();
    }

    if (isLoading) {
        return <PageLoading />;
    }

    return (
        <Page>
            <PageHeader>
                <Breadcrumb
                    items={[
                        { label: 'Media', to: '/media' },
                        { label: `Edit: ${item?.filename ?? 'media'}` },
                    ]}
                />
            </PageHeader>

            <FormLayout>
                {/* Main column */}
                <FormLayoutMain>
                    <Panel title="Preview">
                        {item?.mimeType.startsWith('image/') ? (
                            <img
                                src={item.url}
                                alt={item.alt ?? item.filename}
                                style={{
                                    maxWidth: '100%',
                                    display: 'block',
                                    borderRadius: '0.25rem',
                                }}
                            />
                        ) : (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '3rem',
                                    color: 'var(--am-color-neutral-400)',
                                }}
                            >
                                <FileImage size={48} />
                            </div>
                        )}
                    </Panel>

                    <Panel title="Details">
                        <form.Field name="alt">
                            {(field) => (
                                <Input
                                    id="media-alt"
                                    label="Alt text"
                                    type="text"
                                    value={field.state.value}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                    onBlur={field.handleBlur}
                                    hint="Describe the image for accessibility and SEO."
                                />
                            )}
                        </form.Field>
                    </Panel>
                </FormLayoutMain>

                {/* Sidebar column */}
                <FormLayoutSidebar>
                    <Panel title="Actions">
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem',
                            }}
                        >
                            {canUploadMedia() && (
                                <Button
                                    onClick={handleSave}
                                    loading={updateMutation.isPending}
                                    disabled={!form.state.isDirty}
                                >
                                    Save
                                </Button>
                            )}
                            {canDeleteMedia() && (
                                <Button
                                    variant="danger"
                                    onClick={() =>
                                        confirm({
                                            title: 'Delete media?',
                                            description:
                                                item != null
                                                    ? `Are you sure you want to delete "${item.filename}"? This cannot be undone.`
                                                    : 'This action cannot be undone.',
                                            confirmLabel: 'Delete',
                                            onConfirm: () => deleteMutation.mutate(),
                                        })
                                    }
                                    disabled={deleteMutation.isPending}
                                >
                                    Delete
                                </Button>
                            )}
                        </div>
                    </Panel>

                    <Panel title="Metadata">
                        <dl className="am-meta">
                            <div>
                                <dt className="am-meta__label">Filename</dt>
                                <dd className="am-meta__value am-text-mono">
                                    {item?.filename ?? '—'}
                                </dd>
                            </div>
                            <div>
                                <dt className="am-meta__label">Size</dt>
                                <dd className="am-meta__value">
                                    {item != null ? formatBytes(item.size) : '—'}
                                </dd>
                            </div>
                            <div>
                                <dt className="am-meta__label">Type</dt>
                                <dd className="am-meta__value am-text-mono">
                                    {item?.mimeType ?? '—'}
                                </dd>
                            </div>
                            {item?.width != null && item.height != null && (
                                <div>
                                    <dt className="am-meta__label">Dimensions</dt>
                                    <dd className="am-meta__value">
                                        {item.width} × {item.height}
                                    </dd>
                                </div>
                            )}
                            <div>
                                <dt className="am-meta__label">Uploaded</dt>
                                <dd className="am-meta__value">
                                    {formatDate(item?.createdAt)}
                                </dd>
                            </div>
                            <div>
                                <dt className="am-meta__label">Last updated</dt>
                                <dd className="am-meta__value">
                                    {formatDate(item?.updatedAt)}
                                </dd>
                            </div>
                        </dl>
                    </Panel>
                </FormLayoutSidebar>
            </FormLayout>
        </Page>
    );
}
