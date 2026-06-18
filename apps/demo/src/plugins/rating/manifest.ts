/**
 * Plugin identity — declared once. This is an *external* plugin (it lives in
 * the demo app, not the published `astromech` package), so it cannot import
 * the in-tree identity helpers (`pluginAssetRoot`, etc.). Instead, assets
 * resolve to real filesystem paths via `fileURLToPath`, relative to this file.
 */

import { fileURLToPath } from 'node:url';

export const PACKAGE = 'demo-rating';
export const VERSION = '1.0.0';
export const LABEL = 'Ratings';
export const ICON = 'Star';

/**
 * Absolute filesystem path to a bundled asset (page/field component, locale
 * bundle), resolved relative to this plugin's root — e.g.
 * `asset('fields/rating-field.tsx')`. First-party plugins use the published
 * `asset()` specifier helper instead; external plugins need a real path the
 * code-gen module can `import()`.
 */
export function asset(path: string): string {
    return fileURLToPath(new URL(path, import.meta.url));
}

/** i18n specifier map for the given locale codes, e.g. `locales(['en'])`. */
export function locales(codes: string[]): Record<string, string> {
    return Object.fromEntries(codes.map((code) => [code, asset(`locales/${code}.json`)]));
}
