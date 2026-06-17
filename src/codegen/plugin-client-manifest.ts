/**
 * Code-gen for the `virtual:astromech/plugins/components` virtual module.
 *
 * Browser-bound plugin assets must be statically importable, so this module
 * CODE-GENS lazy `import()` calls from the string import specifiers in plugin
 * definitions (spec §11).
 */

import type { AdminPage } from '@/types/config.js';
import type { PluginDefinition, PluginFieldTypeRegistration } from '@/types/plugins.js';
import {
    resolvePluginIdentity,
    resolvePluginPermission,
} from '@/plugins/runtime/plugin-identity.js';

export function generatePluginClientManifest(plugins: PluginDefinition[]): string {
    const fieldTypeLines = plugins.flatMap((def) => {
        const identity = resolvePluginIdentity(def);
        return (def.fields ?? []).map(
            (reg: PluginFieldTypeRegistration) =>
                `\t${JSON.stringify(reg.type)}: { load: () => import(${JSON.stringify(reg.component)}), defaultValue: ${JSON.stringify(reg.defaultValue ?? null)}, plugin: ${JSON.stringify(identity.name)}, namespace: ${JSON.stringify(identity.permissionNamespace)} },`
        );
    });

    // Component pages keyed `{name}{path}` (e.g. `seo/overview`), matching
    // the catch-all's `/plugin/$` splat. Settings-only pages have no import —
    // they ship via admin-config metadata.
    const pageLines = plugins.flatMap((def) => {
        const identity = resolvePluginIdentity(def);
        return (def.admin?.pages ?? [])
            .filter((page: AdminPage) => page.component !== undefined)
            .map((page: AdminPage) => {
                const permission =
                    page.permission !== undefined
                        ? resolvePluginPermission(
                              identity.permissionNamespace,
                              page.permission
                          )
                        : null;
                // page.label is Label (string | {$t}); stringify directly —
                // the browser-side route resolves it via resolveLabel.
                const labelRaw: string =
                    typeof page.label === 'string' ? page.label : page.label.$t;
                return `\t${JSON.stringify(`${identity.name}${page.path}`)}: { load: () => import(${JSON.stringify(page.component)}), plugin: ${JSON.stringify(identity.name)}, permission: ${JSON.stringify(permission)}, label: ${JSON.stringify(labelRaw)} },`;
            });
    });

    // Locale bundles keyed by i18n namespace (= permissionNamespace), then locale code.
    const i18nLines = plugins.flatMap((def) => {
        const locales = Object.entries(def.i18n ?? {});
        if (locales.length === 0) return [];
        const identity = resolvePluginIdentity(def);
        const inner = locales
            .map(
                ([locale, specifier]) =>
                    `${JSON.stringify(locale)}: () => import(${JSON.stringify(specifier)})`
            )
            .join(', ');
        return [`\t${JSON.stringify(identity.permissionNamespace)}: { ${inner} },`];
    });

    return [
        `export const fieldTypes = {\n${fieldTypeLines.join('\n')}\n};`,
        `export const pages = {\n${pageLines.join('\n')}\n};`,
        `export const i18n = {\n${i18nLines.join('\n')}\n};`,
        '',
    ].join('\n');
}
