/**
 * Collects plugin email template overrides. Identity validation and
 * dependency checks live in `plugin-identity.ts`, assembled from
 * `config-resolver.ts`.
 */

import type { AstromechConfig } from '@/types/index';
import { registerEmailOverride } from '@/email/email-overrides';

/** Register plugin email template overrides. */
export function collectEmailOverrides(config: AstromechConfig): void {
    for (const plugin of config.plugins ?? []) {
        for (const override of plugin.emails ?? []) {
            registerEmailOverride(override);
        }
    }
}
