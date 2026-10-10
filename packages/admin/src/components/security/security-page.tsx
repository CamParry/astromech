/**
 * The Security screen: the block list and the allow list, each a `DataList`
 * with a button that opens a dialog to add an address and a row action that
 * removes it after a confirmation.
 */

import type { DataListColumn } from '../ui/data-list';
import type { AllowedAddress, BlockedAddress } from 'astromech';
import { Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    securityMutations,
    useAllowedAddressesQuery,
    useBlockedAddressesQuery,
} from '../../hooks/security';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
import { usePermissions } from '../../hooks/use-permissions';
import { formatDate, formatDatetime } from '../../utilities/dates';
import { ForbiddenPage } from '../layout/forbidden-page';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { useConfirm } from '../ui/confirm';
import { DataList } from '../ui/data-list';
import { EmptyState } from '../ui/empty-state';
import { Input } from '../ui/input';
import { Modal } from '../ui/modal';
import { Page, PageContent, PageHeader, PageTitle, Stack } from '../ui/page';
import { Select } from '../ui/select';
import { Tabs } from '../ui/tabs';

type SecurityTab = 'blocked' | 'allowed';

/** How long a manual block lasts, by the option's value. */
const EXPIRY_MS = {
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
} as const;

type Expiry = keyof typeof EXPIRY_MS | 'never';

const ADDRESS_FORM_ID = 'security-address-form';

export function SecurityPage(): React.ReactElement {
    const { t } = useTranslation();
    const { canManageSecurity } = usePermissions();
    const [tab, setTab] = useState<SecurityTab>('blocked');
    const [adding, setAdding] = useState<SecurityTab | null>(null);

    // The lists load in the panels, so a refused user's page makes no request.
    if (!canManageSecurity()) return <ForbiddenPage />;

    return (
        <Page>
            <PageHeader>
                <PageTitle>{t('security.title')}</PageTitle>
                <Button variant="secondary" onClick={() => setAdding(tab)}>
                    {tab === 'blocked'
                        ? t('security.blockAddress')
                        : t('security.allowAddress')}
                </Button>
            </PageHeader>

            <PageContent>
                <Tabs
                    tabs={[
                        { value: 'blocked', label: t('security.blockedTitle') },
                        { value: 'allowed', label: t('security.allowedTitle') },
                    ]}
                    value={tab}
                    onChange={(value) =>
                        setTab(value === 'allowed' ? 'allowed' : 'blocked')
                    }
                    renderPanel={(value) =>
                        value === 'allowed' ? <AllowedPanel /> : <BlockedPanel />
                    }
                />
            </PageContent>

            <AddressModal kind={adding} onClose={() => setAdding(null)} />
        </Page>
    );
}

function BlockedPanel(): React.ReactElement {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const { data, isLoading, isError } = useBlockedAddressesQuery();
    const unblock = useAdminMutation(securityMutations().unblock);

    const columns: DataListColumn<BlockedAddress>[] = [
        { key: 'address', label: t('security.columnAddress'), render: (b) => b.address },
        {
            key: 'reason',
            label: t('security.columnReason'),
            render: (b) => (
                <span className="am-text-muted">
                    {b.reason ?? t('security.noReason')}
                </span>
            ),
        },
        {
            key: 'source',
            label: t('security.columnSource'),
            render: (b) => (
                <Badge variant={b.source === 'automatic' ? 'warning' : 'default'}>
                    {b.source === 'automatic'
                        ? t('security.sourceAutomatic')
                        : t('security.sourceManual')}
                </Badge>
            ),
        },
        {
            key: 'expiresAt',
            label: t('security.columnExpires'),
            render: (b) => (
                <span className="am-text-sm am-text-muted">
                    {b.expiresAt === null
                        ? t('security.expiresNever')
                        : formatDatetime(b.expiresAt)}
                </span>
            ),
        },
        {
            key: 'createdAt',
            label: t('security.columnAdded'),
            render: (b) => (
                <span className="am-text-sm am-text-muted">
                    {formatDate(b.createdAt)}
                </span>
            ),
        },
    ];

    function handleUnblock(block: BlockedAddress): void {
        confirm({
            title: t('security.confirmUnblockTitle'),
            description: t('security.confirmUnblockMessage', { address: block.address }),
            confirmLabel: t('security.unblock'),
            onConfirm: () => unblock.mutate(block.id),
        });
    }

    return (
        <DataList
            rows={data ?? []}
            columns={columns}
            isLoading={isLoading}
            isError={isError}
            rowActions={(block) => [
                {
                    label: t('security.unblock'),
                    variant: 'danger' as const,
                    onClick: () => handleUnblock(block),
                    icon: <Trash2 size={14} />,
                },
            ]}
            empty={
                <EmptyState
                    title={t('security.blockedEmpty')}
                    description={t('security.blockedEmptyDescription')}
                />
            }
        />
    );
}

function AllowedPanel(): React.ReactElement {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const { data, isLoading, isError } = useAllowedAddressesQuery();
    const removeAllowed = useAdminMutation(securityMutations().removeAllowed);

    const columns: DataListColumn<AllowedAddress>[] = [
        { key: 'address', label: t('security.columnAddress'), render: (a) => a.address },
        {
            key: 'reason',
            label: t('security.columnReason'),
            render: (a) => (
                <span className="am-text-muted">
                    {a.reason ?? t('security.noReason')}
                </span>
            ),
        },
        {
            key: 'createdAt',
            label: t('security.columnAdded'),
            render: (a) => (
                <span className="am-text-sm am-text-muted">
                    {formatDate(a.createdAt)}
                </span>
            ),
        },
    ];

    function handleRemove(allowed: AllowedAddress): void {
        confirm({
            title: t('security.confirmRemoveTitle'),
            description: t('security.confirmRemoveMessage', { address: allowed.address }),
            confirmLabel: t('security.remove'),
            onConfirm: () => removeAllowed.mutate(allowed.id),
        });
    }

    return (
        <DataList
            rows={data ?? []}
            columns={columns}
            isLoading={isLoading}
            isError={isError}
            rowActions={(allowed) => [
                {
                    label: t('security.remove'),
                    variant: 'danger' as const,
                    onClick: () => handleRemove(allowed),
                    icon: <Trash2 size={14} />,
                },
            ]}
            empty={
                <EmptyState
                    title={t('security.allowedEmpty')}
                    description={t('security.allowedEmptyDescription')}
                />
            }
        />
    );
}

/** The dialog that adds an address to the block list or the allow list; closed when `kind` is null. */
function AddressModal({
    kind,
    onClose,
}: {
    kind: SecurityTab | null;
    onClose: () => void;
}): React.ReactElement {
    const { t } = useTranslation();
    const [address, setAddress] = useState('');
    const [reason, setReason] = useState('');
    const [expiry, setExpiry] = useState<Expiry>('day');
    const block = useAdminMutation(securityMutations().block);
    const allow = useAdminMutation(securityMutations().allow);
    const pending = block.isPending || allow.isPending;

    function close(): void {
        setAddress('');
        setReason('');
        setExpiry('day');
        onClose();
    }

    function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
        e.preventDefault();
        const trimmedReason = reason.trim() === '' ? null : reason.trim();
        if (kind === 'blocked') {
            block.mutate(
                {
                    address,
                    reason: trimmedReason,
                    expiresAt:
                        expiry === 'never'
                            ? null
                            : new Date(Date.now() + EXPIRY_MS[expiry]),
                },
                { onSuccess: close }
            );
        } else {
            allow.mutate({ address, reason: trimmedReason }, { onSuccess: close });
        }
    }

    return (
        <Modal
            open={kind !== null}
            onClose={close}
            title={
                kind === 'allowed'
                    ? t('security.allowAddress')
                    : t('security.blockAddress')
            }
            footer={
                <>
                    <Button variant="secondary" onClick={close}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        type="submit"
                        form={ADDRESS_FORM_ID}
                        variant="primary"
                        disabled={pending || address.trim() === ''}
                    >
                        {kind === 'allowed'
                            ? t('security.allowAddress')
                            : t('security.blockAddress')}
                    </Button>
                </>
            }
        >
            <form id={ADDRESS_FORM_ID} onSubmit={handleSubmit}>
                <Stack gap={5}>
                    <Input
                        label={t('security.addressField')}
                        hint={t('security.addressHint')}
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        required
                    />
                    <Input
                        label={t('security.reasonField')}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                    />
                    {kind === 'blocked' && (
                        <div className="am-field">
                            <label className="am-field-label">
                                {t('security.expiresField')}
                            </label>
                            <Select
                                value={expiry}
                                onValueChange={(value) => setExpiry(toExpiry(value))}
                                options={[
                                    { value: 'hour', label: t('security.expiresHour') },
                                    { value: 'day', label: t('security.expiresDay') },
                                    { value: 'week', label: t('security.expiresWeek') },
                                    { value: 'never', label: t('security.expiresNever') },
                                ]}
                            />
                        </div>
                    )}
                </Stack>
            </form>
        </Modal>
    );
}

function toExpiry(value: string | null): Expiry {
    return value === 'hour' || value === 'week' || value === 'never' ? value : 'day';
}
