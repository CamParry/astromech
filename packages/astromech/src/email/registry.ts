/**
 * Email driver registry.
 *
 * globalThis-backed (see `@/utilities/registry.js`) so the driver set during
 * Astro's config:setup hook (integration context) is visible to the server at
 * request time. Email is optional — reads probe rather than throw.
 */

import { createRegistry } from '@/utilities/registry.js';
import type { EmailDriver } from '@/types/index.js';

type EmailConfig = { driver: EmailDriver; from: string };

const email = createRegistry<EmailConfig>('email', { required: false });

export const setEmailConfig = email.set;
export const getEmailConfig = email.peek;
