/**
 * Backups admin page (`/admin/plugin/backups/`): backup run history plus
 * on-demand trigger, download, restore, and delete actions.
 */

import './backups-page.css';
import type {
    BackupRun,
    DeleteRunResult,
    ListRunsResult,
    TriggerRunResult,
} from '../../service/backups';
import type { BackupRunStatus } from '../../types';
import type { BadgeVariant } from 'astromech/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AstromechApiError } from 'astromech/fetch';
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

/**
 * The plugin's own JSON methods, as `useAstromechPlugin().service` exposes
 * them. Restore and download are not here — they stream, so they stay raw
 * routes, reached through `rawRouteUrl`.
 */
type BackupsService = {
    list: () => Promise<ListRunsResult>;
    run: () => Promise<TriggerRunResult>;
    delete: (input: { id: string }) => Promise<DeleteRunResult>;
};

type ConfirmState =
    | { kind: 'restore'; run: BackupRun }
    | { kind: 'delete'; run: BackupRun }
    | null;

/**
 * The error a failed restore throws. A body in the API's error shape (the 401
 * or 403 the route's access check answers) becomes the `AstromechApiError` the
 * service client throws, so the admin's query client signs the user out on a
 * 401. The route's own `{ error }` body becomes an `Error` with its message.
 */
async function restoreError(res: Response): Promise<Error> {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    const error = body?.error;
    if (typeof error === 'object' && error !== null && 'code' in error) {
        return new AstromechApiError(
            error as ConstructorParameters<typeof AstromechApiError>[0]
        );
    }
    return new Error(typeof error === 'string' ? error : `HTTP ${res.status}`);
}

const STATUS_VARIANTS: Record<BackupRunStatus, BadgeVariant> = {
    running: 'default',
    success: 'success',
    failed: 'danger',
};

function formatBytes(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hasLiveArtifact(run: BackupRun): boolean {
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

export default function BackupsPage(): React.ReactElement {
    const { plugin, service, rawRouteUrl, toast, t } = useAstromechPlugin();
    const backupsService = service as BackupsService;
    const queryClient = useQueryClient();

    const [confirmState, setConfirmState] = useState<ConfirmState>(null);

    const runsKey = ['plugin', plugin, 'runs'];

    const { data, isLoading, isError } = useQuery<ListRunsResult>({
        queryKey: runsKey,
        queryFn: () => backupsService.list(),
    });

    const triggerMutation = useMutation({
        mutationFn: () => backupsService.run(),
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
            const res = await fetch(rawRouteUrl(`/runs/${id}/restore`), {
                method: 'POST',
                credentials: 'include',
            });
            if (!res.ok) throw await restoreError(res);
        },
        onSuccess: () => {
            toast({ message: t('backups.restore.success'), variant: 'success' });
            void queryClient.invalidateQueries({ queryKey: runsKey });
        },
        onError: (error: Error) => {
            toast({
                message: t('backups.restore.failed', { reason: error.message }),
                variant: 'error',
            });
        },
        onSettled: () => {
            setConfirmState(null);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => backupsService.delete({ id }),
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

    function handleRestoreClick(run: BackupRun): void {
        setConfirmState({ kind: 'restore', run });
    }

    function handleDeleteClick(run: BackupRun): void {
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
                                                    href={rawRouteUrl(
                                                        `/runs/${run.id}/download`
                                                    )}
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
