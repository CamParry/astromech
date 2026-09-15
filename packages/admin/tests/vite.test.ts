/**
 * `createAdminViteConfig()`: every bare specifier the admin imports in the
 * browser is listed under the field that declares it, and the icons plugin
 * serves only the names Lucide has.
 */
import type {
    AdminIconsPlugin,
    AdminViteConfigOptions,
    ResolveContext,
} from '@/admin/vite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectRuntimeImports } from '@tests/runtime-imports';
import { describe, expect, it } from 'vitest';
import { createAdminViteConfig } from '@/admin/vite';

type Manifest = {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
};

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

// Runs in Node at config time, not in the browser.
const nodeFiles = ['vite.ts'];
// CSS only, which Vite does not pre-bundle.
const notPreBundled = ['@fontsource-variable/inter'];

describe('createAdminViteConfig()', () => {
    const { optimizeDeps } = createAdminViteConfig();

    it('lists every bare specifier the admin imports in the browser', () => {
        const listed = new Set([
            ...optimizeDeps.dependencies,
            ...optimizeDeps.peerDependencies,
            ...notPreBundled,
        ]);
        const missing = [
            ...collectRuntimeImports(join(packageRoot, 'src'), { skip: nodeFiles }),
        ]
            .filter(([specifier]) => !isCore(specifier) && !listed.has(specifier))
            .map(([specifier, file]) => `${specifier} (imported by src/${file})`);

        expect(missing).toEqual([]);
    });

    it('files each package under the package.json field that declares it', () => {
        const manifest = JSON.parse(
            readFileSync(join(packageRoot, 'package.json'), 'utf8')
        ) as Manifest;
        const misfiled = [
            ...optimizeDeps.dependencies
                .filter(
                    (specifier) =>
                        !(packageNameOf(specifier) in (manifest.dependencies ?? {}))
                )
                .map((specifier) => `${specifier} is not in dependencies`),
            ...optimizeDeps.peerDependencies
                .filter(
                    (specifier) =>
                        !(packageNameOf(specifier) in (manifest.peerDependencies ?? {}))
                )
                .map((specifier) => `${specifier} is not in peerDependencies`),
        ];

        expect(misfiled).toEqual([]);
    });
});

describe('virtual:astromech/admin-icons', () => {
    it('imports only the names Lucide has, and warns once for each unknown one', () => {
        const warnings: string[] = [];
        const plugin = iconsPlugin({
            iconNames: ['FileText', 'NotAnIcon', 'Globe', 'NotAnIcon', 'constructor'],
            warn: (message) => warnings.push(message),
        });

        expect(loadIcons(plugin)).toBe(
            "import { FileText, Globe } from 'lucide-react';\nexport default { FileText, Globe };"
        );
        expect(warnings).toEqual([
            'Unknown Lucide icon "NotAnIcon"; the admin shows its default icon.',
            'Unknown Lucide icon "constructor"; the admin shows its default icon.',
        ]);
    });

    it('exports an empty map when the config names no icons', () => {
        expect(loadIcons(iconsPlugin())).toBe('export default {};');
    });

    it("resolves the module's lucide-react import from the admin entry", async () => {
        const calls: Parameters<ResolveContext['resolve']>[] = [];
        const context: ResolveContext = {
            resolve: (...args) => {
                calls.push(args);
                return Promise.resolve({ id: 'lucide-react.js' });
            },
        };
        const plugin = iconsPlugin();
        const resolvedId = plugin.resolveId.call(context, ICONS_ID, undefined);

        await expect(
            plugin.resolveId.call(context, 'lucide-react', resolvedId as string)
        ).resolves.toEqual({ id: 'lucide-react.js' });
        expect(
            plugin.resolveId.call(context, 'lucide-react', '/site/src/a.tsx')
        ).toBeNull();
        expect(calls).toEqual([
            ['lucide-react', join(packageRoot, 'src', 'main.tsx'), { skipSelf: true }],
        ]);
    });
});

const ICONS_ID = 'virtual:astromech/admin-icons';

const noResolve: ResolveContext = { resolve: () => Promise.resolve(null) };

/** The icons plugin of an admin config built with `options`. */
function iconsPlugin(options?: AdminViteConfigOptions): AdminIconsPlugin {
    const plugin = createAdminViteConfig(options).plugins.find(
        (candidate) => 'name' in candidate && candidate.name === 'astromech:admin-icons'
    );
    return plugin as AdminIconsPlugin;
}

/** The source the icons plugin serves for its virtual module. */
function loadIcons(plugin: AdminIconsPlugin): string | null {
    const resolvedId = plugin.resolveId.call(noResolve, ICONS_ID, undefined);
    return typeof resolvedId === 'string' ? plugin.load(resolvedId) : null;
}

/** Core, which the site's Vite aliases to source rather than pre-bundles. */
function isCore(specifier: string): boolean {
    return specifier === 'astromech' || specifier.startsWith('astromech/');
}

/** `@base-ui/react/menu` is the `@base-ui/react` package; `react/jsx-runtime` is `react`. */
function packageNameOf(specifier: string): string {
    return specifier
        .split('/')
        .slice(0, specifier.startsWith('@') ? 2 : 1)
        .join('/');
}
