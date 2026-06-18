declare module 'virtual:astromech/config' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- inline import() keeps this an ambient module declaration; a top-level/inner `import type` statement breaks the ambient typing and collapses consumers to `any`
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
