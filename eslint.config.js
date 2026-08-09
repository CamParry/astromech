import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

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
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector:
                        'ImportDeclaration[source.value=/^(\\.{1,2}\\/|@\\/|@tests\\/).*\\.js$/]',
                    message:
                        'Drop the .js extension from relative and alias imports — moduleResolution is "bundler".',
                },
                {
                    selector:
                        'ExportNamedDeclaration[source.value=/^(\\.{1,2}\\/|@\\/|@tests\\/).*\\.js$/]',
                    message:
                        'Drop the .js extension from relative and alias imports — moduleResolution is "bundler".',
                },
                {
                    selector:
                        'ExportAllDeclaration[source.value=/^(\\.{1,2}\\/|@\\/|@tests\\/).*\\.js$/]',
                    message:
                        'Drop the .js extension from relative and alias imports — moduleResolution is "bundler".',
                },
                {
                    selector:
                        'ImportExpression[source.value=/^(\\.{1,2}\\/|@\\/|@tests\\/).*\\.js$/]',
                    message:
                        'Drop the .js extension from relative and alias imports — moduleResolution is "bundler".',
                },
            ],
        },
    },
    {
        // Repo tooling: plain Node, run by npm scripts rather than bundled.
        files: ['scripts/**/*.mjs'],
        languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
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
