/**
 * Media edit page.
 *
 * Shows preview, alt text input, and metadata sidebar.
 * Save calls PUT /media/:id, delete calls DELETE /media/:id.
 */

import React from 'react';
import { createFileRoute, useParams, useNavigate } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { FileImage } from 'lucide-react';
import {
    Button,
    Panel,
    Breadcrumb,
    Input,
    PageLoading,
    useConfirm,
    Page,
    PageHeader,
    PageTitle,
    PageContent,
    FormLayout,
    FormLayoutMain,
    FormLayoutSidebar,
} from '@/admin/components/ui/index.js';
import {
    usePermissions,
    useMediaItem,
    useUpdateMedia,
    useDeleteMedia,
} from '@/admin/hooks/index.js';

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

function MediaEditPage(): React.ReactElement {
    const { id } = useParams({ strict: false }) as { id: string };
    const { canUploadMedia, canDeleteMedia } = usePermissions();
    const confirm = useConfirm();
    const navigate = useNavigate();

    const { data: item, isLoading } = useMediaItem(id);

    const form = useForm({
        defaultValues: {
            alt: item?.alt ?? '',
        } satisfies FormValues,
        onSubmit: ({ value }) => {
            updateMutation.mutate({ alt: value.alt });
        },
    });

    const updateMutation = useUpdateMedia(id, {
        onSuccess: () => form.reset(form.state.values),
    });

    const deleteMutation = useDeleteMedia({
        id,
        onSuccess: () => void navigate({ to: '/media' }),
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
                <PageTitle>{item?.filename ?? 'Edit media'}</PageTitle>
                <Breadcrumb
                    items={[
                        { label: 'Media', to: '/media' },
                        { label: `Edit: ${item?.filename ?? 'media'}` },
                    ]}
                />
            </PageHeader>

            <PageContent>
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
                                        onChange={(e) =>
                                            field.handleChange(e.target.value)
                                        }
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
                                                onConfirm: () =>
                                                    deleteMutation.mutate(undefined),
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
                                    <dt className="am-meta-label">Filename</dt>
                                    <dd className="am-meta-value am-text-mono">
                                        {item?.filename ?? '—'}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="am-meta-label">Size</dt>
                                    <dd className="am-meta-value">
                                        {item != null ? formatBytes(item.size) : '—'}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="am-meta-label">Type</dt>
                                    <dd className="am-meta-value am-text-mono">
                                        {item?.mimeType ?? '—'}
                                    </dd>
                                </div>
                                {item?.width != null && item.height != null && (
                                    <div>
                                        <dt className="am-meta-label">Dimensions</dt>
                                        <dd className="am-meta-value">
                                            {item.width} × {item.height}
                                        </dd>
                                    </div>
                                )}
                                <div>
                                    <dt className="am-meta-label">Uploaded</dt>
                                    <dd className="am-meta-value">
                                        {formatDate(item?.createdAt)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="am-meta-label">Last updated</dt>
                                    <dd className="am-meta-value">
                                        {formatDate(item?.updatedAt)}
                                    </dd>
                                </div>
                            </dl>
                        </Panel>
                    </FormLayoutSidebar>
                </FormLayout>
            </PageContent>
        </Page>
    );
}

export const Route = createFileRoute('/_protected/media/$id')({
    component: MediaEditPage,
});
