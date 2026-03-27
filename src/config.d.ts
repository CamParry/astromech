declare module 'virtual:astromech/config' {
    const config: import('./types').ResolvedConfig;
    export default config;
}

declare module 'virtual:astromech/admin-config' {
    import type { AdminConfig } from './types';

    const config: AdminConfig;
    export default config;
}

declare const __ASTROMECH_ADMIN_ROUTE__: string;
declare const __ASTROMECH_API_ROUTE__: string;
