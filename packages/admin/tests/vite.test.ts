/**
 * `createAdminViteConfig()`'s pre-bundled packages: every bare specifier the
 * admin imports in the browser is listed, under the field that declares it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { createAdminViteConfig } from '@/admin/vite';

type Manifest = {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
};

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

// Runs in Node at config time, not in the browser.
const nodeFiles = ['src/vite.ts'];
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
        const missing = [...collectRuntimeImports()]
            .filter(([specifier]) => !listed.has(specifier))
            .map(([specifier, file]) => `${specifier} (imported by ${file})`);

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

/** Each bare specifier `src` imports at runtime, with the first file that imports it. */
function collectRuntimeImports(): Map<string, string> {
    const found = new Map<string, string>();
    const files = readdirSync(join(packageRoot, 'src'), {
        recursive: true,
        encoding: 'utf8',
    })
        .map((file) => join('src', file))
        .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.d.ts'))
        .filter((file) => !nodeFiles.includes(file))
        .sort();

    for (const file of files) {
        for (const specifier of runtimeImportsOf(join(packageRoot, file))) {
            if (isBare(specifier) && !found.has(specifier)) found.set(specifier, file);
        }
    }
    return found;
}

/**
 * The module specifiers a file loads at runtime: imports, re-exports and
 * dynamic `import()`. Under `verbatimModuleSyntax` only `import type` and
 * `export type` are erased, so those are the only ones skipped.
 */
function runtimeImportsOf(file: string): string[] {
    const sourceFile = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true
    );
    const specifiers: string[] = [];

    function visit(node: ts.Node): void {
        if (
            ts.isImportDeclaration(node) &&
            node.importClause?.isTypeOnly !== true &&
            ts.isStringLiteral(node.moduleSpecifier)
        ) {
            specifiers.push(node.moduleSpecifier.text);
        } else if (
            ts.isExportDeclaration(node) &&
            !node.isTypeOnly &&
            node.moduleSpecifier !== undefined &&
            ts.isStringLiteral(node.moduleSpecifier)
        ) {
            specifiers.push(node.moduleSpecifier.text);
        } else if (
            ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword &&
            node.arguments[0] !== undefined &&
            ts.isStringLiteral(node.arguments[0])
        ) {
            specifiers.push(node.arguments[0].text);
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return specifiers;
}

/** A package import, leaving out relative paths, core and virtual modules. */
function isBare(specifier: string): boolean {
    return !(
        specifier.startsWith('.') ||
        specifier.startsWith('virtual:') ||
        specifier === 'astromech' ||
        specifier.startsWith('astromech/')
    );
}

/** `@base-ui/react/menu` is the `@base-ui/react` package; `react/jsx-runtime` is `react`. */
function packageNameOf(specifier: string): string {
    return specifier
        .split('/')
        .slice(0, specifier.startsWith('@') ? 2 : 1)
        .join('/');
}
