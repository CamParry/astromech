/**
 * The Worker's entry. `fetch` is the Astro adapter's, and `scheduled` runs the
 * Astromech tick a Cron Trigger fires. Both register the Worker's environment,
 * which is where the D1 and R2 bindings come from.
 */

import astro from '@astrojs/cloudflare/entrypoints/server';
import { createWorkerEntry } from 'astromech/cloudflare';
import config from '../astromech.config';

export default createWorkerEntry(astro, { config });
