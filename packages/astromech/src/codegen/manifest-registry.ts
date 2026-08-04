/**
 * Runtime slot for the generated method manifest.
 *
 * `generateMethodManifest` needs the RAW plugin definitions, whose Zod schemas
 * cannot survive JSON, so the manifest is generated once at boot and read here.
 */

import { createRegistry } from '@/utilities/registry.js';
import type { MethodManifest } from '@/types/index.js';

const manifest = createRegistry<MethodManifest>('methodManifest', { required: false });

/** Record the manifest generated at boot. */
export const setMethodManifest = manifest.set;

/** The boot-generated manifest, or undefined when boot has not run. */
export function getMethodManifest(): MethodManifest | undefined {
    return manifest.peek() ?? undefined;
}
