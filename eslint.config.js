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
    'components/ui/index',
    'components/fields/index',
    'pages/.*index',
];

// No internal barrels (DECISIONS.md, "A barrel is an entry point, not navigation").
// Only `src/exports/` re-exports, so every other file names the module that
// declares the symbol.
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
        'Internal barrels are removed — import the file that declares the symbol (see DECISIONS.md, "A barrel is an entry point, not navigation").',
}));

// Core's globals share one `globalThis.__astromech` namespace, declared once in
// registry.ts. The namespace grew ten siblings with that invariant already
// written down, so it is a lint rule rather than a convention. The admin has one
// global of its own, declared in its UI instance guard.
const noDeclareGlobal = {
    selector: 'TSModuleDeclaration[global=true]',
    message:
        'Declare core globals in packages/astromech/src/registry.ts, as a key on `globalThis.__astromech`, and the admin global in packages/admin/src/components/ui/instance-guard.ts. Do not add a new global.',
};

// Astro evaluates a module before the request that boots the app, so the
// config and the app instance exist only at call time and a read at module
// scope throws. A class field initialiser runs at construction, so it may read;
// a static one runs with the module, so it may not.
const noModuleScopeConfigRead = {
    selector:
        'CallExpression[callee.name=/^(getConfig|getAstromech)$/]' +
        ':not(:function CallExpression, ' +
        'PropertyDefinition[static=false] > .value, ' +
        'PropertyDefinition[static=false] > .value CallExpression)',
    message:
        'Call getConfig() and getAstromech() inside the function that uses them. Astro evaluates a module before the request that boots the app, so a module-scope call throws.',
};

// The content modules take their dependencies from the method's `ctx`. The
// modules a handler must not reach for are the request scope, the config
// registry, the hook bus and the services bound to the current request.
const contentModules = [
    'entries',
    'globals',
    'media',
    'users',
    'settings',
    'notifications',
    'content',
];

const ambientSources = [
    '@/request-scope/request-scope',
    '@/config/registry',
    '@/hooks/hooks',
    '@/app-context/services',
];

const noAmbientRead = ['ImportDeclaration', 'ImportExpression'].map((node) => ({
    selector: `${node}[source.value=/^(${ambientSources
        .map((m) => m.replaceAll('/', '\\/'))
        .join('|')})$/]`,
    message:
        "Content modules take the user, config, hooks and sibling services from the method's ctx — pass them in rather than reading the request scope, the config registry or the current request's services (see DECISIONS.md).",
}));

// The two files below a content module that legitimately read ambiently:
// `globals/internal/access.ts` (an access rule is a function of the input, so
// it runs before there is a ctx), and the media delivery handler.
const ambientReadExceptions = [
    'packages/astromech/src/globals/internal/access.ts',
    'packages/astromech/src/media/serving/handler.ts',
];

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
        // Type-aware rules, for correctness only (DECISIONS.md, "Type-aware lint
        // catches defects, not style"). Tests are left out: `projectService` reads
        // each package's tsconfig.json, which does not include them.
        files: ['packages/*/src/**/*.{ts,tsx}', 'packages/plugins/*/src/**/*.{ts,tsx}'],
        languageOptions: {
            parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
        },
        rules: {
            '@typescript-eslint/switch-exhaustiveness-check': [
                'error',
                { considerDefaultExhaustiveForUnions: false },
            ],
            '@typescript-eslint/no-unnecessary-type-assertion': 'error',
        },
    },
    {
        files: ['**/*.test.ts', '**/*.test.tsx'],
        rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
    },
    {
        files: ['**/*.ts', '**/*.tsx'],
        rules: {
            'no-restricted-syntax': ['error', ...noJsExtension, noModuleScopeConfigRead],
        },
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
                noModuleScopeConfigRead,
            ],
        },
    },
    {
        // The admin package. Its files import one another by relative path and
        // reach core only through its browser entries: `astromech/shared`,
        // `astromech/fetch` and type-only imports from `astromech`. No other
        // block sets `no-restricted-imports`, so these options are the whole of
        // it for admin files.
        files: ['packages/admin/src/**/*.ts', 'packages/admin/src/**/*.tsx'],
        rules: {
            'no-restricted-syntax': [
                'error',
                ...noJsExtension,
                noDeclareGlobal,
                ...noBarrelImport,
                noModuleScopeConfigRead,
            ],
            '@typescript-eslint/no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            regex: '^@/',
                            message:
                                'The admin imports its own files by relative path and reaches core through astromech/shared, astromech/fetch or a type import from astromech, never a @/ path (see DECISIONS.md).',
                        },
                        {
                            regex: '^astromech/(?!(shared|fetch)$)',
                            message:
                                'The admin may import astromech/shared, astromech/fetch and the astromech root, and no other subpath (see DECISIONS.md).',
                        },
                    ],
                },
            ],
        },
    },
    {
        // The admin's one global, declared beside the check that reads it.
        files: ['packages/admin/src/components/ui/instance-guard.ts'],
        rules: {
            'no-restricted-syntax': [
                'error',
                ...noJsExtension,
                ...noBarrelImport,
                noModuleScopeConfigRead,
            ],
        },
    },
    {
        files: contentModules.map((m) => `packages/astromech/src/${m}/**/*.ts`),
        rules: {
            'no-restricted-syntax': [
                'error',
                ...noJsExtension,
                noDeclareGlobal,
                ...noBarrelImport,
                ...noAmbientRead,
                noModuleScopeConfigRead,
            ],
        },
    },
    {
        files: ambientReadExceptions,
        rules: {
            'no-restricted-syntax': [
                'error',
                ...noJsExtension,
                noDeclareGlobal,
                ...noBarrelImport,
                noModuleScopeConfigRead,
            ],
        },
    },
    {
        files: [
            'packages/astromech/tests/**/*.ts',
            'packages/astromech/tests/**/*.tsx',
            'packages/admin/tests/**/*.ts',
            'packages/admin/tests/**/*.tsx',
        ],
        rules: {
            'no-restricted-syntax': ['error', ...noJsExtension, ...noBarrelImport],
        },
    },
    {
        // `src/exports/` is the published surface, so it is the one place that
        // may re-export a barrel — the `astromech/ui` subpaths are built from it.
        files: ['packages/astromech/src/exports/**/*.ts'],
        rules: {
            'no-restricted-syntax': [
                'error',
                ...noJsExtension,
                noDeclareGlobal,
                noModuleScopeConfigRead,
            ],
        },
    },
    {
        files: ['packages/astromech/src/registry.ts'],
        rules: {
            'no-restricted-syntax': ['error', ...noJsExtension, noModuleScopeConfigRead],
        },
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
                AbortSignal: 'readonly',
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
