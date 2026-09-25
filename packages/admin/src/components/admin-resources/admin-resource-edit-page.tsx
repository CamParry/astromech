/**
 * An admin resource's edit page: loads the row with the get method and renders
 * `<FieldsForm>` over it. Without an update method, or its permission, the form
 * is read-only; a delete action appears with the delete method and its permission.
 */

import type { UseAdminResourceResult } from '../../hooks/use-admin-resource';
import type { AdminResourceRow } from 'astromech';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    adminResourceMutations,
    adminResourceQueryOptions,
} from '../../hooks/admin-resources';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
import { useFieldsForm } from '../../hooks/use-fields-form';
import { useLabel } from '../../i18n/entry-namespace';
import { FieldsForm } from '../forms/fields-form';
import { NotFoundPage } from '../layout/not-found-page';
import { Breadcrumb } from '../ui/breadcrumb';
import { Button } from '../ui/button';
import { useConfirm } from '../ui/confirm';
import { EmptyState } from '../ui/empty-state';
import {
    ButtonGroup,
    Page,
    PageContent,
    PageHeader,
    PageLoading,
    PageTitle,
} from '../ui/page';
import { Panel } from '../ui/panel';
import { AdminResourceGuard } from './admin-resource-guard';

export type AdminResourceEditPageProps = {
    /** The owning plugin's namespace. */
    plugin: string;
    name: string;
    id: string;
};

export function AdminResourceEditPage({
    plugin,
    name,
    id,
}: AdminResourceEditPageProps): React.ReactElement {
    return (
        <AdminResourceGuard plugin={plugin} name={name} method="get">
            {(target) => <AdminResourceEdit target={target} id={id} />}
        </AdminResourceGuard>
    );
}

function AdminResourceEdit({
    target,
    id,
}: {
    target: UseAdminResourceResult;
    id: string;
}): React.ReactElement {
    const { t } = useTranslation();
    const {
        data: row,
        isLoading,
        isError,
    } = useQuery(adminResourceQueryOptions(target, id));

    if (isLoading) return <PageLoading />;
    if (isError) {
        return (
            <Page>
                <PageContent>
                    <EmptyState title={t('adminResources.loadFailed')} />
                </PageContent>
            </Page>
        );
    }
    if (row === null || row === undefined) {
        return <NotFoundPage path={`${target.basePath}/${id}`} />;
    }

    // Keyed on the row: one form instance per record, so a touched form never
    // carries one row's values onto the next.
    return <AdminResourceEditBody key={row.id} target={target} row={row} />;
}

function AdminResourceEditBody({
    target,
    row,
}: {
    target: UseAdminResourceResult;
    row: AdminResourceRow;
}): React.ReactElement {
    const { t } = useTranslation();
    const label = useLabel();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const { resource, basePath, namespace, can } = target;
    const canUpdate = can('update');
    const canDelete = can('delete');

    const mutations = adminResourceMutations(target);
    // The form reports a failed save, a 422 onto its fields.
    const updateMutation = useAdminMutation(mutations.update, { toastError: false });
    const deleteMutation = useAdminMutation(mutations.delete, {
        onSuccess: () => void navigate({ to: basePath }),
    });

    const { id, ...values } = row;
    const resourceForm = useFieldsForm<Record<never, never>, AdminResourceRow>({
        fieldDefinitions: resource.fields,
        operation: 'update',
        namespace,
        defaultValues: { fields: values },
        readOnly: !canUpdate,
        onSubmit: (submitted) =>
            updateMutation.mutateAsync({ id, data: submitted.fields }),
    });
    const { mutation, handleSubmit, isDirty } = resourceForm;

    const singular = label(resource.labelSingular, resource.name);
    const firstColumn = resource.columns[0]?.field;
    const firstValue = firstColumn === undefined ? undefined : row[firstColumn];
    const title =
        typeof firstValue === 'string' && firstValue !== '' ? firstValue : singular;

    function handleDelete(): void {
        confirm({
            title: t('adminResources.confirmDeleteTitle', { name: singular }),
            description: t('adminResources.confirmDeleteMessage'),
            confirmLabel: t('common.delete'),
            variant: 'danger',
            onConfirm: () => deleteMutation.mutate(id),
        });
    }

    return (
        <Page>
            <PageHeader>
                <PageTitle>{title}</PageTitle>
                <Breadcrumb
                    items={[
                        { label: label(resource.label, resource.name), to: basePath },
                        { label: title },
                    ]}
                />
            </PageHeader>

            <PageContent>
                <FieldsForm
                    form={resourceForm}
                    sidebar={
                        (canUpdate || canDelete) && (
                            <Panel title={t('adminResources.actionsPanel')}>
                                <ButtonGroup>
                                    {canUpdate && (
                                        <Button
                                            onClick={() => handleSubmit()}
                                            loading={mutation.isPending}
                                            disabled={!isDirty || mutation.isPending}
                                        >
                                            {t('common.save')}
                                        </Button>
                                    )}
                                    {canDelete && (
                                        <Button
                                            variant="danger"
                                            onClick={handleDelete}
                                            loading={deleteMutation.isPending}
                                        >
                                            {t('common.delete')}
                                        </Button>
                                    )}
                                </ButtonGroup>
                            </Panel>
                        )
                    }
                />
            </PageContent>
        </Page>
    );
}
