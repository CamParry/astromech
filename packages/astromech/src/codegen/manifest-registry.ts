/**
 * Runtime registry for the generated method manifest.
 *
 * Lives in `codegen/` because `codegen/` owns the method manifest as a concept,
 * not because this file generates anything: `method-manifest.ts` generates it,
 * this is the runtime registry holding the generated result, and the two belong
 * beside each other rather than split across `codegen/` and a `boot/` that would
 * hold nothing but this. `generateMethodManifest` needs the RAW plugin
 * definitions, whose Zod schemas cannot survive JSON, so the manifest is
 * generated once at boot and read here rather than written to disk.
 */

import type { MethodManifest } from '@/types/index';
import { createRegistry } from '@/registry';

const manifest = createRegistry<MethodManifest>('methodManifest', { required: false });

/** Record the manifest generated at boot. */
export const setMethodManifest = manifest.set;

/** The boot-generated manifest, or undefined when boot has not run. */
export function getMethodManifest(): MethodManifest | undefined {
    return manifest.get() ?? undefined;
}
