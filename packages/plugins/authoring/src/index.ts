/**
 * @astromech/authoring — an AI authoring assistant for the Astromech admin.
 * Skeleton only: identity, options and the one permission it grants. The chat
 * surface (routes, admin drawer, the model loop) lands in later changes.
 */

import { definePlugin, withDefaults } from 'astromech';
import { authoringPermissions } from './permissions/authoring.js';
import type {
    AuthoringModel,
    AuthoringOptions,
    ResolvedAuthoringOptions,
} from './types.js';

export type { AuthoringModel, AuthoringOptions };

const DEFAULT_OPTIONS: ResolvedAuthoringOptions = {
    model: 'claude-opus-5',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    effort: 'medium',
};

/** Applies defaults. The route piece (a later change) calls this per request. */
export function resolveOptions(options?: AuthoringOptions): ResolvedAuthoringOptions {
    return withDefaults(DEFAULT_OPTIONS, options);
}

// `_options` is unused here: nothing below reads model/apiKeyEnv/effort until
// the route piece lands and calls `resolveOptions` itself, per request.
export const authoring = definePlugin((_options?: AuthoringOptions) => {
    return {
        package: '@astromech/authoring',
        version: '0.1.0',
        label: 'Authoring',
        icon: 'Sparkles',
        permissions: authoringPermissions,
    };
});

export default authoring;
