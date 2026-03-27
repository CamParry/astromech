/**
 * Email driver registry.
 *
 * Uses globalThis so the driver set during Astro's config:setup hook
 * (integration context) is visible to the server at request time.
 */

import type { EmailDriver } from '@/types/index.js';

type EmailConfig = { driver: EmailDriver; from: string };

declare global {
    // eslint-disable-next-line no-var
    var __astromechEmail: EmailConfig | undefined;
}

export function setEmailConfig(config: EmailConfig): void {
    globalThis.__astromechEmail = config;
}

export function getEmailConfig(): EmailConfig | null {
    return globalThis.__astromechEmail ?? null;
}
