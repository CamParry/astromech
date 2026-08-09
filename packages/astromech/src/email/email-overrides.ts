/**
 * Per-template email component overrides, keyed by template name. Held in the
 * shared `globalThis` namespace so a registration made through one bundle entry
 * chunk is visible from the chunk that renders.
 */

import type { ComponentType } from 'react';
import { createKeyedRegistry } from '@/utilities/registry';

type EmailOverride = {
    name: string;
    component: ComponentType<Record<string, unknown>>;
};

const overrides =
    createKeyedRegistry<ComponentType<Record<string, unknown>>>('emailOverrides');

/** Mount a component in place of the built-in template of the same name. */
export function registerEmailOverride(override: EmailOverride): void {
    overrides.set(override.name, override.component);
}

/** The override for a template name, or undefined when none is registered. */
export function getEmailOverride(
    name: string
): ComponentType<Record<string, unknown>> | undefined {
    return overrides.peek(name) ?? undefined;
}
