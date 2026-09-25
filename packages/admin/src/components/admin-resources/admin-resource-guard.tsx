/**
 * Renders an admin resource page only when the resource declares the method
 * the page needs and the user holds its permission; otherwise the not-found
 * page or an access-denied banner.
 */

import type {
    AdminResourceMethod,
    UseAdminResourceResult,
} from '../../hooks/use-admin-resource';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminResource } from '../../hooks/use-admin-resource';
import { EntryNamespaceProvider } from '../../i18n/entry-namespace';
import { NotFoundPage } from '../layout/not-found-page';
import { Page, PageContent } from '../ui/page';

export type AdminResourceGuardProps = {
    /** The owning plugin's namespace. */
    plugin: string;
    name: string;
    /** The method the page calls first: `list` for the list, `create` for the new page. */
    method: AdminResourceMethod;
    children: (target: UseAdminResourceResult) => React.ReactNode;
};

export function AdminResourceGuard({
    plugin,
    name,
    method,
    children,
}: AdminResourceGuardProps): React.ReactElement {
    const { t } = useTranslation();
    const target = useAdminResource(plugin, name);

    if (target === null || target.resource.methods[method] === undefined) {
        return <NotFoundPage path={`/plugin/${plugin}/resources/${name}`} />;
    }

    if (!target.can(method)) {
        return (
            <Page>
                <PageContent>
                    <div className="am-banner am-banner-error" role="alert">
                        {t('plugins.accessDenied')}
                    </div>
                </PageContent>
            </Page>
        );
    }

    return (
        <EntryNamespaceProvider namespace={target.namespace}>
            {children(target)}
        </EntryNamespaceProvider>
    );
}
