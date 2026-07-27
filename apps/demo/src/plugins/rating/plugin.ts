/**
 * Plugin identity — declared once, as one object, plus the asset helpers.
 *
 * This is an *external* plugin (it lives in the demo app, not the published
 * `astromech` package), so assets resolve to real filesystem paths via
 * `fileURLToPath`, relative to this file, rather than to published module
 * specifiers.
 *
 * The package name is unscoped, so it keeps its full name as its namespace
 * (`demo-rating` → `demo_rating`) — only `@astromech/*` strips a scope.
 */

import { fileURLToPath } from 'node:url';
import type { PluginIdentity } from 'astromech';

export const plugin = {
    package: 'demo-rating',
    version: '1.0.0',
    label: 'Ratings',
    icon: 'Star',
} as const satisfies PluginIdentity;

/**
 * Absolute filesystem path to a bundled asset (page/field component, locale
 * bundle), resolved relative to this plugin's root — e.g.
 * `asset('fields/rating-field.tsx')`. First-party plugins use a published
 * specifier helper instead; external plugins need a real path the code-gen
 * module can `import()`.
 */
export function asset(path: string): string {
    return fileURLToPath(new URL(path, import.meta.url));
}

/** i18n specifier map for the given locale codes, e.g. `locales(['en'])`. */
export function locales(codes: string[]): Record<string, string> {
    return Object.fromEntries(codes.map((code) => [code, asset(`locales/${code}.json`)]));
}
