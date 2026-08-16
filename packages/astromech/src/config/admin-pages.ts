/**
 * Resolving the host admin pages an author declares under `admin.pages`.
 */

import type { AdminPage, ResolvedAdminPage } from '@/types/index';
import type { ResolvedEntryFields } from '@/types/fields';
import { assertUniqueDataNames, validateFieldTree } from '@/config/validate/field-tree';
import { toResolvedFields } from '@/config/entry-types';

/** Normalize + structurally validate a `fields`-mode host admin page's tree. */
export function resolvePageFields(page: AdminPage): ResolvedEntryFields {
    const fields = toResolvedFields(page.fields);
    validateFieldTree(page.path, fields.main, false);
    validateFieldTree(page.path, fields.sidebar, false);
    assertUniqueDataNames(page.path, fields);
    return fields;
}

/** Resolve a single host admin page to the unified ResolvedAdminPage. */
export function resolveAdminPage(page: AdminPage): ResolvedAdminPage {
    // XOR validation: exactly one of fields / component.
    if (page.fields === undefined && page.component === undefined) {
        throw new Error(
            `Astromech admin page "${page.path}" needs exactly one of \`fields\` or \`component\`.`
        );
    }
    if (page.fields !== undefined && page.component !== undefined) {
        throw new Error(
            `Astromech admin page "${page.path}" must have exactly one of \`fields\` or \`component\`, not both.`
        );
    }

    // Component mode renders its own React component: nothing to validate, and
    // no settings to guard, so permission defaults to none (as for plugin
    // component pages). `componentKey` is the bare path — both the `/page/$`
    // splat and the key of the codegen'd `hostPages` registry.
    const mode: Pick<ResolvedAdminPage, 'fields' | 'componentKey' | 'permission'> =
        page.component !== undefined
            ? {
                  fields: null,
                  componentKey: page.path,
                  permission: page.permission ?? null,
              }
            : {
                  fields: resolvePageFields(page),
                  componentKey: null,
                  permission: page.permission ?? 'settings:read',
              };

    return {
        key: page.path,
        path: page.path,
        label: page.label,
        ...(page.icon !== undefined ? { icon: page.icon } : {}),
        baseKey: page.path,
        ...mode,
        translatable: page.translatable ?? false,
        nav: page.nav !== false,
        public: page.public ?? false,
    };
}
