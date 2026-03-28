import type { ComponentType } from 'react';

type EmailOverride = {
    name: string;
    component: ComponentType<Record<string, unknown>>;
};

declare global {
    // eslint-disable-next-line no-var
    var __astromechEmailOverrides: Map<string, ComponentType<Record<string, unknown>>> | undefined;
}

function getRegistry(): Map<string, ComponentType<Record<string, unknown>>> {
    globalThis.__astromechEmailOverrides ??= new Map();
    return globalThis.__astromechEmailOverrides;
}

export function registerEmailOverride(override: EmailOverride): void {
    getRegistry().set(override.name, override.component);
}

export function getEmailOverride(name: string): ComponentType<Record<string, unknown>> | undefined {
    return getRegistry().get(name);
}
