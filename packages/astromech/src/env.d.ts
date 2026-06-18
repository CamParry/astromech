/// <reference types="astro/client" />

declare namespace App {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Locals {
        // eslint-disable-next-line @typescript-eslint/consistent-type-imports
        user: import('./types').User | null;
        // eslint-disable-next-line @typescript-eslint/consistent-type-imports
        session: import('better-auth').Session | null;
    }
}
