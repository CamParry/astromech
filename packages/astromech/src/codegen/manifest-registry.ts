/**
 * Runtime registry for the generated method manifest. Lives in `codegen/`
 * because it owns the manifest concept; `method-manifest.ts` generates it,
 * this holds the boot-generated result rather than a round-trip through disk.
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
