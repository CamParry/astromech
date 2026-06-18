declare module 'virtual:astromech/admin-config' {
    import type { AdminConfig } from '../../../types/index.js';
    const config: AdminConfig;
    export default config;
}

declare module 'virtual:astromech/plugins/components' {
    import type { ComponentType } from 'react';
    import type { BaseFieldProps, FieldDefinition } from '../../../types/index.js';

    type PluginFieldModule = {
        default: ComponentType<BaseFieldProps>;
        /** Optional per-change validation; returns an error message or undefined. */
        validate?: (value: unknown, field: FieldDefinition) => string | undefined;
    };

    export const fieldTypes: Record<
        string,
        {
            load: () => Promise<PluginFieldModule>;
            defaultValue: unknown;
            /** Owning plugin's access key. */
            plugin: string;
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

    /** Lazy locale bundles, keyed by i18n namespace then locale code. */
    export const i18n: Record<
        string,
        Record<string, () => Promise<{ default: Record<string, unknown> }>>
    >;
}
