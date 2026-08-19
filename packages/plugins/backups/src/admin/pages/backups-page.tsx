/**
 * Backups admin page (`/admin/plugin/backups/`): backup run history plus
 * on-demand trigger, download, restore, and delete actions.
 */

import './backups-page.css';
import type {
    DeleteRunResult,
    ListRunsResult,
    TriggerRunResult,
} from '../../service/backups';
import type { BackupRunRow } from '../../tables/runs';
import type { BadgeVariant } from 'astromech/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Badge,
    Button,
    ConfirmModal,
    EmptyState,
    PageLoading,
    Spinner,
    Table,
} from 'astromech/ui';
import { useAstromechPlugin } from 'astromech/ui/app';
import React, { useState } from 'react';

// ============================================================================
// Types
// ============================================================================

/**
 * The plugin's own JSON methods, as `useAstromechPlugin().service` exposes
 * them. Restore and download are not here — they stream, so they stay raw
 * routes and are called through `pluginFetch` / `downloadUrl` below.
 */
type BackupsService = {
    listRuns: () => Promise<ListRunsResult>;
    triggerRun: () => Promise<TriggerRunResult>;
    deleteRun: (input: { id: string }) => Promise<DeleteRunResult>;
};

type ConfirmState =
    | { kind: 'restore'; run: BackupRunRow }
    | { kind: 'delete'; run: BackupRunRow }
    | null;

// ============================================================================
// Helpers
// ============================================================================

declare const __ASTROMECH_BASE_PATH__: string;

/** Base for the two raw (streaming) routes; everything else goes through `service`. */
function apiBase(): string {
    const base =
        typeof __ASTROMECH_BASE_PATH__ !== 'undefined' ? __ASTROMECH_BASE_PATH__ : '/cms';
    return `${base}/api`;
}

function rawFetch(plugin: string, path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${apiBase()}/plugins/${plugin}${path}`, {
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
    const { plugin, serviceKey, service, toast, t } = useAstromechPlugin();
    const backupsService = service as BackupsService;
    const queryClient = useQueryClient();

    const [confirmState, setConfirmState] = useState<ConfirmState>(null);

    const runsKey = ['plugin', plugin, 'runs'];

    const { data, isLoading, isError } = useQuery<ListRunsResult>({
        queryKey: runsKey,
        queryFn: () => backupsService.listRuns(),
    });

    const triggerMutation = useMutation({
        mutationFn: () => backupsService.triggerRun(),
        onSuccess: (result) => {
            if (!result.ok) {
                toast({ message: t('backups.alreadyRunning'), variant: 'warning' });
                return;
            }
            void queryClient.invalidateQueries({ queryKey: runsKey });
        },
        onError: () => {
            toast({ message: t('backups.runFailed'), variant: 'error' });
        },
    });

    // Restore streams a gunzipped dump into the driver, so it stays a raw route.
    const restoreMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await rawFetch(serviceKey, `/runs/${id}/restore`, {
                method: 'POST',
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as {
                    error?: string;
                } | null;
                throw new Error(body?.error ?? `HTTP ${res.status}`);
            }
        },
        onSuccess: () => {
            toast({ message: t('backups.restore.success'), variant: 'success' });
            void queryClient.invalidateQueries({ queryKey: runsKey });
        },
        onError: () => {
            toast({ message: t('backups.restore.failed'), variant: 'error' });
        },
        onSettled: () => {
            setConfirmState(null);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => backupsService.deleteRun({ id }),
        onSuccess: (result: DeleteRunResult) => {
            if (!result.ok) {
                toast({ message: t('backups.delete.failed'), variant: 'error' });
                return;
            }
            toast({ message: t('backups.delete.success'), variant: 'success' });
            void queryClient.invalidateQueries({ queryKey: runsKey });
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

    const runs = data.runs;

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

    // Streams a gzipped artifact, so it stays a raw route and is linked directly.
    function downloadUrl(run: BackupRunRow): string {
        return `${apiBase()}/plugins/${serviceKey}/runs/${run.id}/download`;
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
