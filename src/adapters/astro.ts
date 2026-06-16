/**
 * Astromech — Astro adapter
 *
 * Bridges astromech.config.ts with Astro's integration API.
 *
 * @example
 * // astromech.config.ts
 * import { defineConfig } from 'astromech';
 * export default defineConfig({ ... });
 *
 * // astro.config.mjs
 * import { astromech } from 'astromech/astro';
 * import astromechConfig from './astromech.config.ts';
 * export default defineConfig({ integrations: [astromech(astromechConfig)] });
 */

import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import type { AstromechConfig } from '@/types/index.js';
import { resolveConfig } from '@/core/config-resolver.js';
import { resolveRoles } from '@/core/permissions.js';
import { registerRoutes } from '@/core/route-registration.js';
import { setStorageDriver } from '@/storage/registry.js';
import { setImageConfig } from '@/images/registry.js';
import { normaliseWidths } from '@/images/url.js';
import { defaultImageWidths } from '@/images/defaults.js';
import { setEmailConfig } from '@/email/registry.js';
import { setDb, getDb } from '@/db/registry.js';
import { registerBuiltInCronJobs } from '@/cron/index.js';
import { setSchedulerDriver, getSchedulerDriver } from '@/cron/registry.js';
import { nodeDriver } from '@/cron/drivers/index.js';
import { onTick } from '@/cron/runner.js';
import { bootPlugins, registerPlugins } from '@/core/plugin-runtime.js';
import { collectPluginFieldTypes } from '@/core/plugin-fields.js';
import {
    resolvePluginIdentity,
    resolvePluginPermission,
} from '@/core/plugin-identity.js';
import {
    derivePluginNav,
    derivePluginPages,
    resolvePluginLabel,
} from '@/core/plugin-admin.js';
import type {
    AdminEntryTypeConfig,
    AdminPage,
    ResolvedAdminPage,
    ResolvedEntryTypeConfig,
} from '@/types/config.js';
import type { PluginFieldTypeRegistration } from '@/types/plugins.js';

/**
 * Project a resolved entry type into the serializable admin shape. Shared by
 * root entries and plugin-namespaced entries so the two never drift.
 */
function toAdminEntryType(entryType: ResolvedEntryTypeConfig): AdminEntryTypeConfig {
    return {
        single: entryType.single,
        plural: entryType.plural,
        versioning: !!entryType.versioning,
        translatable: entryType.translatable ?? false,
        slug: entryType.slug ? entryType.slug : null,
        adminColumns: entryType.adminColumns ?? [],
        fields: entryType.fields,
        url: entryType.url ?? null,
        capabilities: entryType.capabilities,
        titleField: entryType.titleField,
        ...(entryType.icon !== undefined ? { icon: entryType.icon } : {}),
        ...(entryType.views !== undefined ? { views: entryType.views } : {}),
        ...(entryType.defaultView !== undefined
            ? { defaultView: entryType.defaultView }
            : {}),
        ...(entryType.gridFields !== undefined
            ? { gridFields: entryType.gridFields }
            : {}),
        ...(entryType.search !== undefined ? { search: entryType.search } : {}),
    };
}

async function runMigrations(logger: {
    info: (msg: string) => void;
    error: (msg: string) => void;
}): Promise<void> {
    try {
        const { migrate } = await import('drizzle-orm/libsql/migrator');
        // dist/adapters/astro.js — go up two levels to reach package root drizzle/
        const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
        await migrate(getDb(), { migrationsFolder });
        logger.info('Astromech database migrations applied');
    } catch (err) {
        logger.error(
            `Astromech failed to apply migrations: ${err instanceof Error ? err.message : String(err)}`
        );
    }
}

export function astromech(config: AstromechConfig): AstroIntegration {
    const resolvedConfig = resolveConfig(config);
    // dist/adapters/astro.js — go up two levels to reach package src/
    const pkgSrc = fileURLToPath(new URL('../../src', import.meta.url));

    return {
        name: 'astromech',
        hooks: {
            'astro:config:setup': async ({
                updateConfig,
                injectRoute,
                addMiddleware,
                logger,
            }) => {
                logger.info('Initializing Astromech CMS');

                setDb(config.db.getInstance());
                setStorageDriver(config.storage);
                if (config.image) {
                    setImageConfig({
                        driver: config.image.driver,
                        widths: normaliseWidths(
                            config.image.widths ?? defaultImageWidths
                        ),
                        avif: config.image.avif ?? true,
                        mediaRoute: resolvedConfig.mediaRoute,
                    });
                }
                if (config.email) {
                    setEmailConfig(config.email);
                }
                registerBuiltInCronJobs();
                // Scheduler driver selection (triggering only; cadence lives in the cron
                // table). Mirrors email-driver selection. Default = in-process node timer.
                setSchedulerDriver(config.scheduler ?? nodeDriver);
                registerPlugins(config.plugins ?? [], resolvedConfig);
                // Boot crash-loud: requiredEnv validation, cron registration, setup().
                await bootPlugins(config.plugins ?? []);

                process.env.ASTROMECH_API_ROUTE = resolvedConfig.apiRoute;

                updateConfig({
                    vite: {
                        resolve: {
                            // Public browser-facing entries alias to package src so
                            // plugin components share module identity (React context,
                            // hooks) with the admin app. Specific keys first — the
                            // bare `astromech/ui` would otherwise shadow them.
                            alias: {
                                'astromech/ui/fields':
                                    pkgSrc + '/admin/components/fields/index.ts',
                                'astromech/ui/layout':
                                    pkgSrc + '/admin/components/ui/layout.ts',
                                'astromech/ui': pkgSrc + '/admin/components/ui/index.ts',
                                '@/': pkgSrc + '/',
                            },
                        },
                        ssr: {
                            noExternal: ['@fontsource-variable/inter'],
                        },
                        optimizeDeps: {
                            include: [
                                'react',
                                'react-dom',
                                'react/jsx-runtime',
                                'lucide-react',
                                '@tanstack/react-router',
                                '@tanstack/react-query',
                                '@base-ui/react',
                                'i18next',
                                'react-i18next',
                                '@tiptap/core',
                                '@tiptap/react',
                                '@tiptap/starter-kit',
                                'lodash-es',
                            ],
                        },
                        define: {
                            __ASTROMECH_ADMIN_ROUTE__: JSON.stringify(
                                resolvedConfig.adminRoute
                            ),
                            __ASTROMECH_API_ROUTE__: JSON.stringify(
                                resolvedConfig.apiRoute
                            ),
                        },
                        plugins: [
                            TanStackRouterVite({
                                routesDirectory: pkgSrc + '/admin/pages',
                                generatedRouteTree: pkgSrc + '/admin/routeTree.gen.ts',
                                routeToken: 'route',
                            }),
                            {
                                name: 'virtual:astromech/config',
                                resolveId(id) {
                                    if (id === 'virtual:astromech/config') {
                                        return '\0virtual:astromech/config';
                                    }
                                    return undefined;
                                },
                                load(id) {
                                    if (id === '\0virtual:astromech/config') {
                                        return `export default ${JSON.stringify(resolvedConfig)};`;
                                    }
                                    return undefined;
                                },
                            },
                            {
                                name: 'virtual:astromech/admin-config',
                                resolveId(id) {
                                    if (id === 'virtual:astromech/admin-config') {
                                        return '\0virtual:astromech/admin-config';
                                    }
                                    return undefined;
                                },
                                load(id) {
                                    if (id === '\0virtual:astromech/admin-config') {
                                        const resolvedRoles = resolveRoles(config);
                                        const adminConfig = {
                                            plugins: (config.plugins ?? []).map((p) => {
                                                const identity = resolvePluginIdentity(p);
                                                const pluginEntries =
                                                    resolvedConfig.pluginEntries[
                                                        identity.name
                                                    ] ?? {};
                                                return {
                                                    name: identity.name,
                                                    label: resolvePluginLabel(
                                                        p,
                                                        identity
                                                    ),
                                                    permissionNamespace:
                                                        identity.permissionNamespace,
                                                    nav: derivePluginNav(identity, p),
                                                    entries: Object.fromEntries(
                                                        Object.entries(pluginEntries).map(
                                                            ([name, entryType]) => [
                                                                name,
                                                                toAdminEntryType(
                                                                    entryType
                                                                ),
                                                            ]
                                                        )
                                                    ),
                                                    // derivePluginPages now returns ResolvedAdminPage[]
                                                    pages: derivePluginPages(
                                                        identity,
                                                        p
                                                    ) as ResolvedAdminPage[],
                                                };
                                            }),
                                            adminRoute: resolvedConfig.adminRoute,
                                            apiRoute: resolvedConfig.apiRoute,
                                            locales: resolvedConfig.locales ?? [],
                                            defaultLocale:
                                                resolvedConfig.defaultLocale ?? 'en',
                                            roles: Object.entries(resolvedRoles).map(
                                                ([slug, r]) => ({ slug, name: r.name })
                                            ),
                                            entries: Object.fromEntries(
                                                Object.entries(
                                                    resolvedConfig.entries
                                                ).map(([name, entryType]) => [
                                                    name,
                                                    toAdminEntryType(entryType),
                                                ])
                                            ),
                                            pages: resolvedConfig.adminPages,
                                        };
                                        return `export default ${JSON.stringify(adminConfig)};`;
                                    }
                                    return undefined;
                                },
                            },
                            {
                                // Browser-bound plugin assets must be statically importable, so
                                // this module CODE-GENS lazy `import()` calls from the string
                                // import specifiers in plugin definitions (spec §11).
                                name: 'virtual:astromech/plugins/components',
                                resolveId(id) {
                                    if (id === 'virtual:astromech/plugins/components') {
                                        return '\0virtual:astromech/plugins/components';
                                    }
                                    return undefined;
                                },
                                load(id) {
                                    if (id === '\0virtual:astromech/plugins/components') {
                                        const fieldTypeLines = (
                                            config.plugins ?? []
                                        ).flatMap((def) => {
                                            const identity = resolvePluginIdentity(def);
                                            return (def.fields ?? []).map(
                                                (reg: PluginFieldTypeRegistration) =>
                                                    `\t${JSON.stringify(reg.type)}: { load: () => import(${JSON.stringify(reg.component)}), defaultValue: ${JSON.stringify(reg.defaultValue ?? null)}, plugin: ${JSON.stringify(identity.name)}, namespace: ${JSON.stringify(identity.permissionNamespace)} },`
                                            );
                                        });
                                        // Component pages keyed `{name}{path}` (e.g.
                                        // `seo/overview`), matching the catch-all's
                                        // `/plugin/$` splat. Settings-only pages have no
                                        // import — they ship via admin-config metadata.
                                        const pageLines = (config.plugins ?? []).flatMap(
                                            (def) => {
                                                const identity =
                                                    resolvePluginIdentity(def);
                                                return (def.admin?.pages ?? [])
                                                    .filter(
                                                        (page: AdminPage) =>
                                                            page.component !== undefined
                                                    )
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
                                                            typeof page.label === 'string'
                                                                ? page.label
                                                                : page.label.$t;
                                                        return `\t${JSON.stringify(`${identity.name}${page.path}`)}: { load: () => import(${JSON.stringify(page.component)}), plugin: ${JSON.stringify(identity.name)}, permission: ${JSON.stringify(permission)}, label: ${JSON.stringify(labelRaw)} },`;
                                                    });
                                            }
                                        );
                                        // Locale bundles keyed by i18n namespace
                                        // (= permissionNamespace), then locale code.
                                        const i18nLines = (config.plugins ?? []).flatMap(
                                            (def) => {
                                                const locales = Object.entries(
                                                    def.i18n ?? {}
                                                );
                                                if (locales.length === 0) return [];
                                                const identity =
                                                    resolvePluginIdentity(def);
                                                const inner = locales
                                                    .map(
                                                        ([locale, specifier]) =>
                                                            `${JSON.stringify(locale)}: () => import(${JSON.stringify(specifier)})`
                                                    )
                                                    .join(', ');
                                                return [
                                                    `\t${JSON.stringify(identity.permissionNamespace)}: { ${inner} },`,
                                                ];
                                            }
                                        );
                                        return [
                                            `export const fieldTypes = {\n${fieldTypeLines.join('\n')}\n};`,
                                            `export const pages = {\n${pageLines.join('\n')}\n};`,
                                            `export const i18n = {\n${i18nLines.join('\n')}\n};`,
                                            '',
                                        ].join('\n');
                                    }
                                    return undefined;
                                },
                            },
                        ],
                    },
                });

                registerRoutes(injectRoute, resolvedConfig);

                addMiddleware({
                    entrypoint: 'astromech/middleware',
                    order: 'pre',
                });

                logger.info(
                    `Admin UI: ${resolvedConfig.adminRoute}, API: ${resolvedConfig.apiRoute}`
                );
                logger.info(
                    `Entry types: ${Object.keys(resolvedConfig.entries).join(', ')}`
                );
            },

            'astro:config:done': async ({ injectTypes, logger }) => {
                const { generateSdkTypes } = await import('@/core/type-generator.js');
                injectTypes({
                    filename: 'astromech.d.ts',
                    content: generateSdkTypes(
                        resolvedConfig,
                        collectPluginFieldTypes(config.plugins ?? []),
                        config.plugins ?? []
                    ),
                });
                logger.info('Astromech configuration complete');
            },

            'astro:server:setup': async ({ logger }) => {
                logger.info('Astromech dev server ready');
                await runMigrations(logger);
                // Start the scheduler tick (dev / long-running node). nodeDriver guards a
                // single interval, so this is idempotent. NOTE: a built production Node
                // server does not re-run integration hooks — that path relies on the http
                // poke (POST /cron/run) or an external trigger instead.
                await getSchedulerDriver()?.start(onTick);
            },

            'astro:build:done': async ({ logger }) => {
                logger.info('Astromech build complete');
                await runMigrations(logger);
            },
        },
    };
}
