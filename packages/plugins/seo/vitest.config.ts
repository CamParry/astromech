// The aliases resolve core to its source, so this plugin and its tests share
// one module graph. See `packages/astromech/tests/_support/plugin-vitest-config.ts`.
import { pluginVitestConfig } from '../../astromech/tests/_support/plugin-vitest-config';

const config = pluginVitestConfig();

// This plugin has no tests yet, and vitest exits 1 on a run that matches no
// files. Drop this line with the first test.
export default { ...config, test: { ...config.test, passWithNoTests: true } };
