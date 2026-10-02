// The aliases resolve core to its source, so this plugin and its tests share
// one module graph. `adminPages` runs `tests/admin/` in happy-dom with the
// admin's setup. See `packages/astromech/tests/_support/plugin-vitest-config.ts`.
import { pluginVitestConfig } from '../../astromech/tests/_support/plugin-vitest-config';

export default pluginVitestConfig({ adminPages: true });
