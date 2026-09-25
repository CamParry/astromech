/**
 * An admin resource's create page: `<FieldsForm>` over the resource's fields.
 * A create sends `{ data }` to the create method, then opens the new row, or
 * returns to the list when the resource has no get method.
 */

import type { UseAdminResourceResult } from '../../hooks/use-admin-resource';
import type { AdminResourceRow } from 'astromech';
import { useNavigate } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { adminResourceMutations } from '../../hooks/admin-resources';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
import { useFieldsForm } from '../../hooks/use-fields-form';
import { useLabel } from '../../i18n/entry-namespace';
import { FieldsForm } from '../forms/fields-form';
import { Breadcrumb } from '../ui/breadcrumb';
import { Button } from '../ui/button';
import { Page, PageContent, PageHeader, PageTitle } from '../ui/page';
import { Panel } from '../ui/panel';
import { AdminResourceGuard } from './admin-resource-guard';

export type AdminResourceNewPageProps = {
    /** The owning plugin's namespace. */
    plugin: string;
    name: string;
};

export function AdminResourceNewPage({
    plugin,
    name,
}: AdminResourceNewPageProps): React.ReactElement {
    return (
        <AdminResourceGuard plugin={plugin} name={name} method="create">
            {(target) => <AdminResourceNew target={target} />}
        </AdminResourceGuard>
    );
}

function AdminResourceNew({
    target,
}: {
    target: UseAdminResourceResult;
}): React.ReactElement {
    const { t } = useTranslation();
    const label = useLabel();
    const navigate = useNavigate();
    const { resource, basePath, namespace } = target;

    // The form reports a failed create, a 422 onto its fields.
    const createMutation = useAdminMutation(adminResourceMutations(target).create, {
        toastError: false,
    });

    const resourceForm = useFieldsForm<Record<never, never>, AdminResourceRow>({
        fieldDefinitions: resource.fields,
        operation: 'create',
        namespace,
        onSubmit: (values) => createMutation.mutateAsync(values.fields),
        onSuccess: (saved) =>
            void navigate({
                to:
                    resource.methods.get !== undefined
                        ? `${basePath}/${saved.id}`
                        : basePath,
            }),
    });
    const { mutation, handleSubmit } = resourceForm;

    const title = t('adminResources.create', {
        name: label(resource.labelSingular, resource.name),
    });

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
                        <Panel title={t('adminResources.actionsPanel')}>
                            <Button
                                onClick={() => handleSubmit()}
                                loading={mutation.isPending}
                                disabled={mutation.isPending}
                            >
                                {t('common.create')}
                            </Button>
                        </Panel>
                    }
                />
            </PageContent>
        </Page>
    );
}
