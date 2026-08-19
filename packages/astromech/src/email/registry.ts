/**
 * Email driver registry.
 *
 * globalThis-backed (see `@/registry.js`) so the driver `initRuntime`
 * sets is visible to every reader, whichever entry chunk it came through. Email
 * is optional — reads probe rather than throw.
 */

import type { EmailDriver } from '@/types/index';
import { createRegistry } from '@/registry';

const email = createRegistry<EmailDriver>('email', { required: false });

export const setEmailDriver = email.set;
export const getEmailDriver = email.get;
