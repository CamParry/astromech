/**
 * How a CLI command reaches a service method once the application has booted:
 * through the manifest the boot generated, and `callMethod` as a trusted caller.
 */

import type { ManifestMethod, MethodManifest } from '@/types/index';
import { getMethodManifest } from '@/codegen/manifest-registry';
import { callMethod } from '@/policies/call-method';

/** The manifest the boot generated. Throws when called before the boot. */
export function bootedManifest(): MethodManifest {
    const manifest = getMethodManifest();
    if (manifest === undefined) {
        throw new Error(
            'The method manifest is set at boot; boot the application first.'
        );
    }
    return manifest;
}

/**
 * Call the manifest method matching `find` as a trusted caller, with `args`.
 * `describe` names it in the error when none matches.
 */
export async function callTrusted<T>(
    find: (method: ManifestMethod) => boolean,
    describe: string,
    args: Record<string, unknown>
): Promise<T> {
    const method = bootedManifest().methods.find(find);
    if (method === undefined) throw new Error(`Unknown method ${describe}.`);
    return (await callMethod(method, args, 'trusted')) as T;
}

/** Call a core method (`users.create`) as a trusted caller. */
export function callCoreMethod<T>(id: string, args: Record<string, unknown>): Promise<T> {
    return callTrusted<T>((method) => method.id === id, `"${id}"`, args);
}

/** Call one entry type's method (`create` on `post`) as a trusted caller. */
export function callEntryMethod<T>(
    type: string,
    name: string,
    args: Record<string, unknown>
): Promise<T> {
    return callTrusted<T>(
        (method) =>
            method.source === 'entries' &&
            method.typeId === type &&
            method.method === name,
        `"entries.${name}" for the entry type "${type}"`,
        args
    );
}
