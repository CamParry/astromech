/**
 * Confirmation modal for trashing or permanently deleting an entry. Surfaces
 * a cascade-locales toggle and an incoming-relationships list, each shown
 * only when relevant.
 */

import type { Entry, IncomingRelationship } from '@/types/index';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/admin/components/ui/button';
import { Checkbox } from '@/admin/components/ui/checkbox';
import { Modal } from '@/admin/components/ui/modal';
import { Spinner } from '@/admin/components/ui/spinner';
import { useIncomingRelationships } from '@/admin/hooks/entries';

type DeleteEntryModalProps = {
    open: boolean;
    entry: Entry | null;
    /** Display label for the entry type (singular). */
    typeLabel: string;
    /**
     * Permanent delete vs trash. Trash is reversible (no cascade-delete of versions),
     * permanent delete also drops versions + relationships.
     */
    force: boolean;
    onCancel: () => void;
    onConfirm: (options: { cascadeLocales: boolean }) => void;
    loading?: boolean;
};

export function DeleteEntryModal({
    open,
    entry,
    typeLabel,
    force,
    onCancel,
    onConfirm,
    loading = false,
}: DeleteEntryModalProps): React.ReactElement | null {
    const { t } = useTranslation();
    const [cascadeLocales, setCascadeLocales] = useState(false);

    // Reset checkbox each time the modal opens for a different entry.
    React.useEffect(() => {
        if (open) setCascadeLocales(false);
    }, [open, entry?.id]);

    const localeSiblings =
        entry != null
            ? Object.entries(entry.locales ?? {}).filter(([, id]) => id !== entry.id)
            : [];
    const hasSiblings = localeSiblings.length > 0;

    const { data: incoming, isLoading: incomingLoading } = useIncomingRelationships(
        entry?.type ?? '',
        entry?.id ?? '',
        open && entry != null
    );
    const incomingCount = incoming?.length ?? 0;

    if (entry == null) return null;

    return (
        <Modal
            open={open}
            onClose={onCancel}
            title={
                force
                    ? t('entries.confirmForceDeleteTitle')
                    : t('entries.confirmDeleteTitle')
            }
            footer={
                <>
                    <Button variant="secondary" onClick={onCancel} disabled={loading}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant="danger"
                        onClick={() => onConfirm({ cascadeLocales })}
                        loading={loading}
                    >
                        {force
                            ? t('entries.confirmForceDeleteLabel')
                            : t('entries.confirmDeleteLabel')}
                    </Button>
                </>
            }
        >
            <p>
                {force
                    ? t('entries.confirmForceDeleteMessage')
                    : t('entries.confirmDeleteMessage', {
                          name: typeLabel.toLowerCase(),
                      })}
            </p>
            <p>
                {entry.title ? (
                    <strong>{entry.title}</strong>
                ) : (
                    <strong className="am-text-mono">{entry.id}</strong>
                )}{' '}
                {entry.locale && (
                    <span className="am-text-muted am-text-sm">
                        ({entry.locale.toUpperCase()})
                    </span>
                )}
            </p>

            {hasSiblings && (
                <div className="am-field" style={{ marginTop: '1rem' }}>
                    <Checkbox
                        checked={cascadeLocales}
                        onChange={() => setCascadeLocales((v) => !v)}
                        label={t('entries.cascadeLocalesLabel', {
                            count: localeSiblings.length,
                        })}
                    />
                </div>
            )}

            {open && (incomingLoading || incomingCount > 0) && (
                <div style={{ marginTop: '1rem' }}>
                    {incomingLoading ? (
                        <Spinner />
                    ) : (
                        <>
                            <p className="am-text-sm">
                                {t('entries.incomingRelationshipsHeader', {
                                    count: incomingCount,
                                })}
                            </p>
                            <ul
                                className="am-text-sm am-text-muted"
                                style={{ paddingLeft: '1.25rem' }}
                            >
                                {(incoming ?? [])
                                    .slice(0, 10)
                                    .map((r: IncomingRelationship) => (
                                        <li key={`${r.sourceId}-${r.schemaPath}`}>
                                            {r.sourceTitle || r.sourceId}{' '}
                                            <span className="am-text-mono">
                                                ({r.sourceType}.{r.schemaPath})
                                            </span>
                                        </li>
                                    ))}
                                {incomingCount > 10 && (
                                    <li>… +{incomingCount - 10} more</li>
                                )}
                            </ul>
                        </>
                    )}
                </div>
            )}
        </Modal>
    );
}
