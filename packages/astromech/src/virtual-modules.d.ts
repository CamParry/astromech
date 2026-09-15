declare module 'virtual:astromech/config' {
    /** The author's config as written. Boot resolves it and publishes the result. */
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- inline import() keeps this an ambient module declaration; a top-level/inner `import type` statement breaks the ambient typing and collapses consumers to `any`
    export const rawConfig: import('./types').AstromechConfig;
}

declare const __ASTROMECH_BASE_PATH__: string;
