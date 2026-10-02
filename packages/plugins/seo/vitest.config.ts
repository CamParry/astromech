// The aliases resolve core to its source, so this plugin and its tests share
// one module graph. `adminPages` runs `tests/admin/` in happy-dom with the
// admin's setup. See `packages/astromech/tests/_support/plugin-vitest-config.ts`.
import { pluginVitestConfig } from '../../astromech/tests/_support/plugin-vitest-config';

export default pluginVitestConfig({
    adminPages: true,
    // One entry per top-level directory of src/, plus the files at its root,
    // each set one point below what it measured. Raise an entry as coverage
    // rises; never lower one to pass.
    coverageThresholds: {
        'src/*.{ts,tsx}': { lines: 99, functions: 99, branches: 99, statements: 99 },
        'src/admin/**': { lines: 71, functions: 61, branches: 44, statements: 71 },
        'src/fields/**': { lines: 99, functions: 99, branches: 99, statements: 99 },
        'src/globals/**': { lines: 99, functions: 99, branches: 99, statements: 99 },
        'src/helpers/**': { lines: 99, functions: 99, branches: 99, statements: 99 },
        'src/pages/**': { lines: 99, functions: 99, branches: 99, statements: 99 },
        'src/permissions/**': { lines: 99, functions: 99, branches: 99, statements: 99 },
        'src/service/**': { lines: 99, functions: 99, branches: 92, statements: 97 },
        'src/utilities/**': { lines: 99, functions: 99, branches: 99, statements: 99 },
    },
});
