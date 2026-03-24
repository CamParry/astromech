declare module 'virtual:astromech/config' {
    const config: import('./types').ResolvedConfig;
    export default config;
}

declare module 'virtual:astromech/admin-config' {
    import type { FieldGroup, AdminColumn, SlugConfig } from './types';

    type AdminCollectionConfig = {
        single: string;
        plural: string;
        versioning: boolean;
        slug: SlugConfig | null;
        adminColumns: AdminColumn[];
        fieldGroups: FieldGroup[];
        views?: ('list' | 'grid')[];
        defaultView?: 'list' | 'grid';
        gridFields?: { field: string; label?: string }[];
        previewUrl: string | null;
    };

    type AdminConfig = {
        adminRoute: string;
        apiRoute: string;
        collections: Record<string, AdminCollectionConfig>;
    };

    const config: AdminConfig;
    export default config;
}

declare const __ASTROMECH_ADMIN_ROUTE__: string;
declare const __ASTROMECH_API_ROUTE__: string;
