// The virtual modules the admin imports. Core's Astro integration builds the
// config and plugin modules from the site config, and `src/vite.ts` builds the
// icon map from the names core passes it. These declarations type all three.

declare module 'virtual:astromech/admin-config' {
    import type { AdminConfig } from 'astromech';

    const config: AdminConfig;
    export default config;
}

declare module 'virtual:astromech/admin-icons' {
    import type { LucideIcon } from 'lucide-react';

    /** The Lucide icons the admin config names, keyed by icon name. */
    const icons: Record<string, LucideIcon>;
    export default icons;
}

declare module 'virtual:astromech/plugins/components' {
    import type { ComponentType } from 'react';
    import type { AdminSlotName, BaseFieldProps, Field } from 'astromech';

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
            /** Owning plugin's service key: its `Astromech.plugins.*` property. */
            serviceKey: string;
            /** Owning plugin's permissionNamespace (i18n namespace). */
            namespace: string;
        }
    >;

    type PluginPageModule = {
        default: ComponentType;
    };

    /** Keyed `{name}{path}`, e.g. `seo/dashboard`, which matches the `/plugin/$` splat. */
    export const pages: Record<
        string,
        {
            load: () => Promise<PluginPageModule>;
            plugin: string;
            permission: string | null;
            label: string | null;
        }
    >;

    /** Host `admin.pages` component views, keyed by `path`, which matches the `/page/$` splat. */
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
            /** Owning plugin's service key: its `Astromech.plugins.*` property. */
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
