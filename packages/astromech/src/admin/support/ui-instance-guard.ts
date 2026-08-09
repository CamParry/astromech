/** Dev-only detection of a second copy of the admin UI barrel in one page. */

import { globals } from '@/utilities/registry';

/**
 * Records the UI barrel's module URL and logs if a different URL turns up.
 * Two copies mean two React contexts, so context reads from plugin components fail.
 */
export function assertSingleUiInstance(moduleUrl: string): void {
    if (!import.meta.env.DEV) return;

    const existing = globals().uiInstance;
    if (existing === undefined) {
        globals().uiInstance = moduleUrl;
        return;
    }
    if (existing === moduleUrl) return;

    console.error(
        `[astromech] two copies of the admin UI library are loaded:\n  ${existing}\n  ${moduleUrl}\n` +
            'React context lookups across the two copies will fail (e.g. useAstromechPlugin() throws). ' +
            'This is usually a stale packages/astromech/dist — run `npm run build` at the repo root and restart the dev server.'
    );
}
