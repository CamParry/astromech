declare module 'virtual:astromech/config' {
    /** The author's config as written. Boot resolves it and publishes the result. */
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- inline import() keeps this an ambient module declaration; a top-level/inner `import type` statement breaks the ambient typing and collapses consumers to `any`
    export const rawConfig: import('./types').AstromechConfig;
    /**
     * Whether Astro's `security.allowedDomains` is set, which lets Astro take
     * `clientAddress` from a request's `x-forwarded-for`, when it carries one,
     * rather than the connection.
     */
    export const astroReadsForwardedFor: boolean;
    /** The app's migration names when the site was built, or null with no chain. */
    export const migrationNames: readonly string[] | null;
}

declare const __ASTROMECH_BASE_PATH__: string;
