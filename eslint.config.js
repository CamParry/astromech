import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

const noJsExtension = [
    'ImportDeclaration',
    'ExportNamedDeclaration',
    'ExportAllDeclaration',
    'ImportExpression',
].map((node) => ({
    selector: `${node}[source.value=/^(\\.{1,2}\\/|@\\/|@tests\\/).*\\.js$/]`,
    message:
        'Drop the .js extension from relative and alias imports — moduleResolution is "bundler".',
}));

// The modules named `index` that a file may still import: the type-only
// surface, the two tsup entry points (the CLI bin and the MCP server), the two
// `astromech/ui` alias targets, and the router's route pages, where `index` is
// the URL segment. Matched on the tail so a relative specifier resolves the
// same as an aliased one.
const nonBarrelIndexModules = [
    'types/index',
    'transport/cli/index',
    'transport/mcp/index',
    'admin/components/ui/index',
    'admin/components/fields/index',
    'pages/.*index',
];

// Internal barrels are removed (`decisions/0093`). Only `src/exports/` re-exports
// one, so every other file names the module that declares the symbol.
const noBarrelImport = [
    'ImportDeclaration',
    'ExportNamedDeclaration',
    'ExportAllDeclaration',
    'ImportExpression',
].map((node) => ({
    selector:
        `${node}[source.value=/^(@\\/|\\.{1,2}\\/)(.*\\/)?index$/]` +
        // esquery ends a regex literal at the first unescaped `/`, so every
        // slash in the alternation is escaped before it goes into the selector.
        `[source.value!=/\\/(${nonBarrelIndexModules.map((m) => m.replaceAll('/', '\\/')).join('|')})$/]`,
    message:
        'Internal barrels are removed — import the file that declares the symbol (see decisions/0093).',
}));

// Core's globals share one `globalThis.__astromech` namespace, declared once in
// registry.ts. The namespace grew ten siblings with that invariant already
// written down, so it is a lint rule rather than a convention.
const noDeclareGlobal = {
    selector: 'TSModuleDeclaration[global=true]',
    message:
        'Declare globals in packages/astromech/src/registry.ts only — add a key to `globalThis.__astromech` instead of a new global.',
};

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.strict,
    ...tseslint.configs.stylistic,
    {
        rules: {
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
        },
    },
    {
        files: ['**/*.test.ts', '**/*.test.tsx'],
        rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
    },
    {
        files: ['**/*.ts', '**/*.tsx'],
        rules: { 'no-restricted-syntax': ['error', ...noJsExtension] },
    },
    {
        // `no-restricted-syntax` options replace rather than merge, so each block
        // that narrows the set has to restate the ones it keeps.
        files: ['packages/astromech/src/**/*.ts', 'packages/astromech/src/**/*.tsx'],
        rules: {
            'no-restricted-syntax': [
                'error',
                ...noJsExtension,
                noDeclareGlobal,
                ...noBarrelImport,
            ],
        },
    },
    {
        files: ['packages/astromech/tests/**/*.ts', 'packages/astromech/tests/**/*.tsx'],
        rules: {
            'no-restricted-syntax': ['error', ...noJsExtension, ...noBarrelImport],
        },
    },
    {
        // `src/exports/` is the published surface, so it is the one place that
        // may re-export a barrel — the `astromech/ui` subpaths are built from it.
        files: ['packages/astromech/src/exports/**/*.ts'],
        rules: {
            'no-restricted-syntax': ['error', ...noJsExtension, noDeclareGlobal],
        },
    },
    {
        files: ['packages/astromech/src/registry.ts'],
        rules: { 'no-restricted-syntax': ['error', ...noJsExtension] },
    },
    {
        // Repo tooling: plain Node, run by npm scripts rather than bundled.
        files: ['scripts/**/*.mjs'],
        languageOptions: {
            globals: {
                console: 'readonly',
                process: 'readonly',
                fetch: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
            },
        },
    },
    {
        ignores: [
            'dist/',
            'node_modules/',
            'demo/',
            '*.config.js',
            '*.config.mjs',
            '**/dist/',
        ],
    }
);
