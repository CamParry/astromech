/**
 * `createAdminViteConfig()`'s pre-bundled packages: every bare specifier the
 * admin imports in the browser is listed, under the field that declares it.
 */
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
