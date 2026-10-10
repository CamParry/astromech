/**
 * Renders an admin resource page only when the resource declares the method
 * the page needs and the user holds its permission; otherwise the not-found
 * page or the forbidden page.
 */

import type {
    AdminResourceMethod,
    UseAdminResourceResult,
} from '../../hooks/use-admin-resource';
import React from 'react';
import { useAdminResource } from '../../hooks/use-admin-resource';
import { LabelNamespaceProvider } from '../../i18n/label-namespace';
import { ForbiddenPage } from '../layout/forbidden-page';
import { NotFoundPage } from '../layout/not-found-page';

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
    const target = useAdminResource(plugin, name);

    if (target === null || target.resource.methods[method] === undefined) {
        return <NotFoundPage path={`/plugin/${plugin}/resources/${name}`} />;
    }

    if (!target.can(method)) return <ForbiddenPage />;

    return (
        <LabelNamespaceProvider namespace={target.namespace}>
            {children(target)}
        </LabelNamespaceProvider>
    );
}
