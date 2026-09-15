/**
 * Collects the bare package specifiers a directory's TypeScript loads at
 * runtime, for the checks that a package lists what Vite must pre-bundle.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

/**
 * Each bare specifier the `.ts` and `.tsx` files under `dir` import at runtime,
 * with the first file (relative to `dir`) that imports it. `skip` names files,
 * relative to `dir`, to leave out. Relative and `virtual:` imports are left out.
 */
export function collectRuntimeImports(
    dir: string,
    options: { skip?: string[] } = {}
): Map<string, string> {
    const skip = options.skip ?? [];
    const found = new Map<string, string>();
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.d.ts'))
        .filter((file) => !skip.includes(file))
        .sort();

    for (const file of files) {
        for (const specifier of runtimeImportsOf(join(dir, file))) {
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

// The site's own copies, which it already pre-bundles flat.
const siteOwned = new Set(['react', 'react-dom', 'react/jsx-runtime']);

/**
 * Each package a plugin's admin components under `adminDir` import at runtime
 * but `include`, its `admin.optimizeDeps.include`, misses, as `<specifier> (imported by
 * <file>)`. Core (`astromech`, `astromech/*`), which the site's Vite aliases to
 * source, and the site's own React are exempt.
 */
export function missingFromOptimizeDeps(
    include: readonly string[] | undefined,
    adminDir: string
): string[] {
    const listed = new Set<string>(include);
    return [...collectRuntimeImports(adminDir)]
        .filter(
            ([specifier]) =>
                specifier !== 'astromech' && !specifier.startsWith('astromech/')
        )
        .filter(([specifier]) => !siteOwned.has(specifier) && !listed.has(specifier))
        .map(([specifier, file]) => `${specifier} (imported by src/admin/${file})`);
}

function isBare(specifier: string): boolean {
    return !(specifier.startsWith('.') || specifier.startsWith('virtual:'));
}
