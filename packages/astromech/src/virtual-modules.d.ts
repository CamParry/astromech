declare module 'virtual:astromech/config' {
    /** The author's config as written. Boot resolves it and publishes the result. */
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- inline import() keeps this an ambient module declaration; a top-level/inner `import type` statement breaks the ambient typing and collapses consumers to `any`
    export const rawConfig: import('./types').AstromechConfig;
}

declare module 'virtual:astromech/admin-config' {
    import type { AdminConfig } from './types';

    const config: AdminConfig;
    export default config;
}

declare module 'virtual:astromech/plugins/components' {
    import type { ComponentType } from 'react';
    import type { BaseFieldProps, Field } from './types/index';
    import type { AdminSlotName } from './types/index';

    type PluginFieldModule = {
        default: ComponentType<BaseFieldProps>;
        /** Optional per-change validation; returns an error message or undefined. */
        validate?: (value: unknown, field: Field) => string | undefined;
    };

    export const fieldTypes: Record<
        string,
        {
            load: () => Promise<PluginFieldModule>;
            defaultValue: unknown;
            /** Owning plugin's namespace. */
            plugin: string;
            /** Owning plugin's service key — its `Astromech.plugins.*` property. */
            serviceKey: string;
            /** Owning plugin's permissionNamespace (i18n namespace). */
            namespace: string;
        }
    >;

    type PluginPageModule = {
        default: ComponentType;
    };

    /** Keyed `{name}{path}`, e.g. `seo/dashboard` — matches the `/plugin/$` splat. */
    export const pages: Record<
        string,
        {
            load: () => Promise<PluginPageModule>;
            plugin: string;
            permission: string | null;
            label: string | null;
        }
    >;

    /** Host `admin.pages` component views, keyed by `path` — matches the `/page/$` splat. */
    export const hostPages: Record<
        string,
        {
            load: () => Promise<PluginPageModule>;
            permission: string | null;
            label: string;
        }
    >;

    /** Plugin contributions to named admin-shell slots, grouped by slot, order-sorted. */
    export const slots: Record<
        AdminSlotName,
        {
            id: string;
            load: () => Promise<PluginPageModule>;
            /** Owning plugin's namespace. */
            plugin: string;
            /** Owning plugin's service key — its `Astromech.plugins.*` property. */
            serviceKey: string;
            /** Owning plugin's permissionNamespace (i18n namespace). */
            namespace: string;
            permission: string | null;
            order: number;
        }[]
    >;

    /** Lazy locale bundles, keyed by i18n namespace then locale code. */
    export const i18n: Record<
        string,
        Record<string, () => Promise<{ default: Record<string, unknown> }>>
    >;
}

declare const __ASTROMECH_BASE_PATH__: string;
