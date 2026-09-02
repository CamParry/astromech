/**
 * Code-gen for the `virtual:astromech/plugins/components` virtual module.
 * Browser-bound assets must be statically importable, so this generates
 * lazy `import()` calls from the string specifiers in plugin definitions.
 */

import type { AdminPage, AdminSlotContribution, AdminSlotName } from '@/types/config';
import type { PluginDefinition, PluginFieldTypeRegistration } from '@/types/plugins';
import { fileURLToPath } from 'node:url';
import { AstromechError } from '@/errors/astromech-error';
import {
    resolvePluginIdentity,
    resolvePluginPermission,
} from '@/plugins/runtime/plugin-identity';

/**
 * Turn a plugin's asset specifier into one this module can emit an
 * `import()` for. Relative specifiers resolve against the plugin's declared
 * `root` (a `file:` URL for unpublished plugins, else `<root ?? package>`).
 */
function resolveAssetSpecifier(def: PluginDefinition, specifier: string): string {
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) return specifier;

    const root = def.root;
    if (root !== undefined && root.startsWith('file:')) {
        return fileURLToPath(new URL(specifier, root));
    }
    // Strip only a leading `./`; `../` has no meaning against a bare specifier
    // root, so it is left in place to fail loudly rather than resolve wrongly.
    return `${root ?? def.package}/${specifier.replace(/^\.\//, '')}`;
}

/**
 * Turn a host `admin.pages` component specifier into one this module can
 * emit an `import()` for. A host page has no plugin `root`, so relative
 * specifiers resolve against the Astro project root instead.
 */
function resolveHostSpecifier(root: string, specifier: string): string {
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) return specifier;
    return fileURLToPath(new URL(specifier, root));
}

/** `Label` is `string | { $t }`; the browser-side route resolves it via resolveLabel. */
function labelText(label: AdminPage['label']): string {
    return typeof label === 'string' ? label : label.$t;
}

/** Generate the module source: field-type, page, slot and i18n loaders for every installed plugin. */
export function generatePluginClientManifest(
    plugins: PluginDefinition[],
    host?: { pages: AdminPage[]; root: string }
): string {
    const fieldTypeLines = plugins.flatMap((def) => {
        const identity = resolvePluginIdentity(def);
        return (def.fields ?? []).map(
            (reg: PluginFieldTypeRegistration) =>
                `\t${JSON.stringify(reg.type)}: { load: () => import(${JSON.stringify(resolveAssetSpecifier(def, reg.component))}), defaultValue: ${JSON.stringify(reg.defaultValue ?? null)}, plugin: ${JSON.stringify(identity.namespace)}, serviceKey: ${JSON.stringify(identity.serviceKey)}, namespace: ${JSON.stringify(identity.permissionNamespace)} },`
        );
    });

    // Component pages keyed `{name}{path}` (e.g. `seo/overview`), matching
    // the catch-all's `/plugin/$` splat.
    const pageLines = plugins.flatMap((def) => {
        const identity = resolvePluginIdentity(def);
        return (def.admin?.pages ?? []).map((page: AdminPage) => {
            const permission =
                page.permission !== undefined
                    ? resolvePluginPermission(
                          identity.permissionNamespace,
                          page.permission
                      )
                    : null;
            return `\t${JSON.stringify(`${identity.namespace}${page.path}`)}: { load: () => import(${JSON.stringify(resolveAssetSpecifier(def, page.component))}), plugin: ${JSON.stringify(identity.namespace)}, permission: ${JSON.stringify(permission)}, label: ${JSON.stringify(labelText(page.label))} },`;
        });
    });

    // Host `admin.pages` component views, keyed by the bare `path` — exactly
    // the `/page/$` splat. Host keys are NOT namespaced (that's the plugin
    // rule); permissions are taken verbatim, since a host page authors a real key.
    const hostRoot = host?.root ?? '';
    const hostPageLines = (host?.pages ?? []).map(
        (page) =>
            `\t${JSON.stringify(page.path)}: { load: () => import(${JSON.stringify(resolveHostSpecifier(hostRoot, page.component))}), permission: ${JSON.stringify(page.permission ?? null)}, label: ${JSON.stringify(labelText(page.label))} },`
    );

    const SLOT_NAMES: AdminSlotName[] = ['global-overlay', 'right-drawer', 'toolbar'];
    const slotRows: Record<AdminSlotName, { order: number; line: string }[]> = {
        'global-overlay': [],
        'right-drawer': [],
        toolbar: [],
    };
    plugins.forEach((def) => {
        const identity = resolvePluginIdentity(def);
        (def.admin?.slots ?? []).forEach((slot: AdminSlotContribution, index: number) => {
            if (!(slot.slot in slotRows)) {
                throw new AstromechError(
                    `Plugin "${identity.package}" declares an unknown admin slot "${slot.slot}". Valid slots: ${SLOT_NAMES.join(', ')}.`
                );
            }
            const permission =
                slot.permission !== undefined
                    ? resolvePluginPermission(
                          identity.permissionNamespace,
                          slot.permission
                      )
                    : null;
            const id = slot.id ?? `${identity.namespace}:${slot.slot}:${index}`;
            const order = slot.order ?? 0;
            const line = `\t\t{ id: ${JSON.stringify(id)}, load: () => import(${JSON.stringify(resolveAssetSpecifier(def, slot.component))}), plugin: ${JSON.stringify(identity.namespace)}, serviceKey: ${JSON.stringify(identity.serviceKey)}, namespace: ${JSON.stringify(identity.permissionNamespace)}, permission: ${JSON.stringify(permission)}, order: ${JSON.stringify(order)} },`;
            slotRows[slot.slot].push({ order, line });
        });
    });
    const slotBlocks = SLOT_NAMES.map((name) => {
        const sorted = slotRows[name]
            .map((row, i) => ({ row, i }))
            .sort((a, b) => a.row.order - b.row.order || a.i - b.i)
            .map((x) => x.row.line);
        return `\t${JSON.stringify(name)}: [\n${sorted.join('\n')}\n\t],`;
    });

    // Locale bundles keyed by i18n namespace (= permissionNamespace), then locale
    // code. The `['en', 'fr']` shorthand expands to `./locales/<code>.json`
    // before the shared asset resolution runs.
    const i18nLines = plugins.flatMap((def) => {
        const declared = def.i18n;
        const locales = Array.isArray(declared)
            ? declared.map((code) => [code, `./locales/${code}.json`] as const)
            : Object.entries(declared ?? {});
        if (locales.length === 0) return [];
        const identity = resolvePluginIdentity(def);
        const inner = locales
            .map(
                ([locale, specifier]) =>
                    `${JSON.stringify(locale)}: () => import(${JSON.stringify(resolveAssetSpecifier(def, specifier))})`
            )
            .join(', ');
        return [`\t${JSON.stringify(identity.permissionNamespace)}: { ${inner} },`];
    });

    return [
        `export const fieldTypes = {\n${fieldTypeLines.join('\n')}\n};`,
        `export const pages = {\n${pageLines.join('\n')}\n};`,
        `export const hostPages = {\n${hostPageLines.join('\n')}\n};`,
        `export const slots = {\n${slotBlocks.join('\n')}\n};`,
        `export const i18n = {\n${i18nLines.join('\n')}\n};`,
        '',
    ].join('\n');
}
