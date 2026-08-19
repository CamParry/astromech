/** Dev-only detection of a second copy of the admin UI in one page. */

import { globals } from '@/registry';

/**
 * Records this module's URL and logs if a different URL turns up.
 * Two copies mean two React contexts, so context reads from plugin components fail.
 * Both UI barrels call it, so the sentinel is this module rather than the caller.
 */
export function assertSingleUiInstance(): void {
    // `import.meta.env` is a Vite global; the kit barrel also loads under plain Node.
    if (import.meta.env?.DEV !== true) return;

    const existing = globals().uiInstance;
    if (existing === undefined) {
        globals().uiInstance = import.meta.url;
        return;
    }
    if (existing === import.meta.url) return;

    console.error(
        `[astromech] two copies of the admin UI library are loaded:\n  ${existing}\n  ${import.meta.url}\n` +
            'React context lookups across the two copies will fail (e.g. useAstromechPlugin() throws). ' +
            'This is usually a stale packages/astromech/dist — run `npm run build` at the repo root and restart the dev server.'
    );
}
