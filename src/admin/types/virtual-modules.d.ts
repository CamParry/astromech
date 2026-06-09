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
        { load: () => Promise<PluginFieldModule>; defaultValue: unknown }
    >;
}
