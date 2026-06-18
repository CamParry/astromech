/**
 * Backups admin page (`/admin/plugin/backups/`): backup run history plus
 * on-demand trigger, download, restore, and delete actions.
 */

import './backups-page.css';
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BadgeVariant } from 'astromech/ui';
import {
    Badge,
    Button,
    ConfirmModal,
    EmptyState,
    PageLoading,
    Spinner,
    Table,
    useAstromechPlugin,
} from 'astromech/ui';
import type { BackupRunRow } from '../../schema/runs.js';

// ============================================================================
// Types
// ============================================================================

type Capabilities = {
    canDump: boolean;
    canRestore: boolean;
};

type ListRunsResponse = {
    data: BackupRunRow[];
    capabilities: Capabilities;
};

type ConfirmState =
    | { kind: 'restore'; run: BackupRunRow }
    | { kind: 'delete'; run: BackupRunRow }
    | null;

// ============================================================================
// Helpers
// ============================================================================

declare const __ASTROMECH_API_ROUTE__: string;

function pluginFetch(path: string, init?: RequestInit): Promise<Response> {
    const base =
        typeof __ASTROMECH_API_ROUTE__ !== 'undefined' ? __ASTROMECH_API_ROUTE__ : '/api';
    return fetch(`${base}/plugins/backups${path}`, {
        credentials: 'include',
        ...init,
    });
}

const STATUS_VARIANTS: Record<BackupRunRow['status'], BadgeVariant> = {
    running: 'neutral',
    success: 'success',
    failed: 'danger',
};

function formatBytes(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hasLiveArtifact(run: BackupRunRow): boolean {
    return (
        run.status === 'success' &&
        run.key !== null &&
        run.key !== undefined &&
        (run.artifactDeletedAt === null || run.artifactDeletedAt === undefined)
    );
}

function formatDate(date: Date | null | undefined): string {
    if (date === null || date === undefined) return '—';
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date instanceof Date ? date : new Date(date));
}

// ============================================================================
// Component
// ============================================================================

export default function BackupsPage(): React.ReactElement {
    const { toast, t } = useAstromechPlugin();
    const queryClient = useQueryClient();

    const [confirmState, setConfirmState] = useState<ConfirmState>(null);

    const { data, isLoading, isError } = useQuery<ListRunsResponse>({
        queryKey: ['plugin', 'backups', 'runs'],
        queryFn: async () => {
            const res = await pluginFetch('/runs');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json() as Promise<ListRunsResponse>;
        },
    });

    const triggerMutation = useMutation({
        mutationFn: async () => {
            const res = await pluginFetch('/run', { method: 'POST' });
            if (res.status === 409) {
                toast({ message: t('backups.alreadyRunning'), variant: 'warning' });
                return;
            }
            if (!res.ok) {
                toast({ message: t('backups.runFailed'), variant: 'error' });
                return;
            }
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: ['plugin', 'backups', 'runs'],
            });
        },
    });

    const restoreMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await pluginFetch(`/runs/${id}/restore`, { method: 'POST' });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as {
                    error?: string;
                } | null;
                throw new Error(body?.error ?? `HTTP ${res.status}`);
            }
        },
        onSuccess: () => {
            toast({ message: t('backups.restore.success'), variant: 'success' });
            void queryClient.invalidateQueries({
                queryKey: ['plugin', 'backups', 'runs'],
            });
        },
        onError: () => {
            toast({ message: t('backups.restore.failed'), variant: 'error' });
        },
        onSettled: () => {
            setConfirmState(null);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await pluginFetch(`/runs/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as {
                    error?: string;
                } | null;
                throw new Error(body?.error ?? `HTTP ${res.status}`);
            }
        },
        onSuccess: () => {
            toast({ message: t('backups.delete.success'), variant: 'success' });
            void queryClient.invalidateQueries({
                queryKey: ['plugin', 'backups', 'runs'],
            });
        },
        onError: () => {
            toast({ message: t('backups.delete.failed'), variant: 'error' });
        },
        onSettled: () => {
            setConfirmState(null);
        },
    });

    const capabilities = data?.capabilities ?? { canDump: true, canRestore: true };

    // ---- loading / error guards ----

    if (isLoading) {
        return <PageLoading />;
    }

    if (isError || data === undefined) {
        return (
            <div className="am-banner am-banner-error" role="alert">
                {t('backups.loadError')}
            </div>
        );
    }

    const runs = data.data;

    // ---- confirm dialog helpers ----

    function handleRestoreClick(run: BackupRunRow): void {
        setConfirmState({ kind: 'restore', run });
    }

    function handleDeleteClick(run: BackupRunRow): void {
        setConfirmState({ kind: 'delete', run });
    }

    function handleConfirm(): void {
        if (confirmState === null) return;
        if (confirmState.kind === 'restore') {
            restoreMutation.mutate(confirmState.run.id);
        } else {
            deleteMutation.mutate(confirmState.run.id);
        }
    }

    function handleConfirmClose(): void {
        if (restoreMutation.isPending || deleteMutation.isPending) return;
        setConfirmState(null);
    }

    const isConfirmLoading = restoreMutation.isPending || deleteMutation.isPending;

    const confirmTitle =
        confirmState === null
            ? ''
            : confirmState.kind === 'restore'
              ? t('backups.restore.dialogTitle')
              : t('backups.delete.dialogTitle');

    const confirmMessage =
        confirmState === null
            ? undefined
            : confirmState.kind === 'restore'
              ? t('backups.restore.dialogBody', {
                    date: formatDate(confirmState.run.startedAt),
                })
              : t('backups.delete.dialogBody');

    const confirmLabel =
        confirmState === null
            ? ''
            : confirmState.kind === 'restore'
              ? t('backups.restore.confirmLabel')
              : t('backups.delete.confirmLabel');

    // ---- download URL ----

    function downloadUrl(run: BackupRunRow): string {
        const base =
            typeof __ASTROMECH_API_ROUTE__ !== 'undefined'
                ? __ASTROMECH_API_ROUTE__
                : '/api';
        return `${base}/plugins/backups/runs/${run.id}/download`;
    }

    return (
        <div className="am-backups-page">
            {!capabilities.canDump && (
                <div className="am-banner am-banner-warning" role="alert">
                    {t('backups.noDriverBanner')}
                </div>
            )}

            <div className="am-backups-toolbar">
                <Button
                    onClick={() => triggerMutation.mutate()}
                    disabled={!capabilities.canDump || triggerMutation.isPending}
                    loading={triggerMutation.isPending}
                    aria-busy={triggerMutation.isPending}
                >
                    {t('backups.runNow')}
                </Button>
            </div>

            {runs.length === 0 ? (
                <EmptyState
                    title={t('backups.pageTitle')}
                    description={t('backups.empty')}
                />
            ) : (
                <Table.Root>
                    <Table.Head>
                        <Table.Row>
                            <Table.Th>{t('backups.columns.startedAt')}</Table.Th>
                            <Table.Th>{t('backups.columns.status')}</Table.Th>
                            <Table.Th>{t('backups.columns.trigger')}</Table.Th>
                            <Table.Th>{t('backups.columns.size')}</Table.Th>
                            <Table.Th>{/* actions */}</Table.Th>
                        </Table.Row>
                    </Table.Head>
                    <Table.Body>
                        {runs.map((run) => {
                            const live = hasLiveArtifact(run);
                            return (
                                <Table.Row key={run.id}>
                                    <Table.Td>{formatDate(run.startedAt)}</Table.Td>
                                    <Table.Td>
                                        <Badge variant={STATUS_VARIANTS[run.status]}>
                                            {t(`backups.status.${run.status}`)}
                                        </Badge>
                                    </Table.Td>
                                    <Table.Td>
                                        {t(`backups.trigger.${run.trigger}`)}
                                    </Table.Td>
                                    <Table.Td>
                                        {live
                                            ? formatBytes(run.sizeBytes)
                                            : t('backups.sizeExpired')}
                                    </Table.Td>
                                    <Table.Td>
                                        {live && (
                                            <div className="am-backups-row-actions">
                                                <a
                                                    href={downloadUrl(run)}
                                                    download
                                                    className="am-btn am-btn-secondary am-btn-sm"
                                                >
                                                    {t('backups.actions.download')}
                                                </a>
                                                {capabilities.canRestore && (
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() =>
                                                            handleRestoreClick(run)
                                                        }
                                                    >
                                                        {t('backups.actions.restore')}
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => handleDeleteClick(run)}
                                                >
                                                    {t('backups.actions.delete')}
                                                </Button>
                                            </div>
                                        )}
                                    </Table.Td>
                                </Table.Row>
                            );
                        })}
                    </Table.Body>
                </Table.Root>
            )}

            {runs.some((r) => r.status === 'running') && (
                <div className="am-backups-running-indicator" aria-live="polite">
                    <Spinner size="sm" />
                </div>
            )}

            <ConfirmModal
                open={confirmState !== null}
                onClose={handleConfirmClose}
                onConfirm={handleConfirm}
                title={confirmTitle}
                {...(confirmMessage !== undefined ? { message: confirmMessage } : {})}
                confirmLabel={confirmLabel}
                confirmVariant="danger"
                loading={isConfirmLoading}
            />
        </div>
    );
}
