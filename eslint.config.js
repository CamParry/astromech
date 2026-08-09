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

// Core's globals share one `globalThis.__astromech` namespace, declared once in
// utilities/registry.ts. The namespace grew ten siblings with that invariant
// already written down, so it is a lint rule rather than a convention.
const noDeclareGlobal = {
    selector: 'TSModuleDeclaration[global=true]',
    message:
        'Declare globals in packages/astromech/src/utilities/registry.ts only — add a key to `globalThis.__astromech` instead of a new global.',
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
            'no-restricted-syntax': ['error', ...noJsExtension, noDeclareGlobal],
        },
    },
    {
        files: ['packages/astromech/src/utilities/registry.ts'],
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
