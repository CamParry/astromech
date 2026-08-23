/**
 * Cloudflare binding lookup. Bindings are referenced by name ('MEDIA', 'DB')
 * rather than by object, because the same driver config is loaded by Node
 * processes that have no Worker environment to hold one.
 */

import { isWorkersRuntime, resolveEnvSource } from '@/env/index';
import { AstromechError } from '@/errors/astromech-error';
import { createRegistry } from '@/registry';

type PlatformProxy = {
    env: Record<string, unknown>;
    dispose(): Promise<void>;
};

type WranglerModule = {
    getPlatformProxy(): Promise<PlatformProxy>;
};

/**
 * Memoised as a promise so concurrent callers share one wrangler startup, and
 * held on `globalThis` because tsup emits several entry chunks that would
 * otherwise each get their own module-level copy.
 */
const pendingProxy = createRegistry<Promise<PlatformProxy>>('wranglerProxy', {
    required: false,
});

/** Held only so `disposeBindings()` can shut the wrangler proxy down. */
const openProxy = createRegistry<PlatformProxy>('wranglerProxyOpen', { required: false });

/**
 * Resolve a named binding. Inside a Worker it comes from the environment the
 * entry registered; in Node it comes from wrangler's local emulation.
 */
export async function resolveBinding<T>(name: string): Promise<T> {
    // A registered environment is authoritative: the host holds the real one,
    // so a miss against it is a misconfiguration rather than a reason to look
    // somewhere else.
    const registered = resolveEnvSource();
    if (registered !== undefined) return pick<T>(registered, name);

    if (isWorkersRuntime()) {
        throw new AstromechError(
            `Cloudflare binding '${name}' is not available. Inside a Worker the ` +
                'environment comes from the entry built by `createWorkerEntry`, so ' +
                'check that your wrangler `main` points at it.'
        );
    }

    return pick<T>(await startWrangler(), name);
}

function pick<T>(env: Record<string, unknown>, name: string): T {
    if (!(name in env)) {
        const available = Object.keys(env);
        throw new AstromechError(
            `Cloudflare binding '${name}' not found. Available bindings: ` +
                `${available.length > 0 ? available.join(', ') : '(none)'}. ` +
                'Check the `bindings` section of your wrangler config.'
        );
    }
    return env[name] as T;
}

/**
 * Release the wrangler platform proxy. A Node process that resolved a binding
 * will not exit until this runs.
 */
export async function disposeBindings(): Promise<void> {
    const proxy = openProxy.get();
    if (proxy) await proxy.dispose();
    openProxy.clear();
    pendingProxy.clear();
}

/** @internal Test-only. Forgets the proxy without disposing it. */
export function resetBindings(): void {
    openProxy.clear();
    pendingProxy.clear();
}

/** Boot wrangler's local emulation and hand back its environment. */
function startWrangler(): Promise<Record<string, unknown>> {
    let pending = pendingProxy.get();
    if (pending === null) {
        // A failed start is dropped rather than memoised forever, so a caller
        // that installs wrangler afterwards can still recover.
        pending = openWrangler().catch((error: unknown) => {
            pendingProxy.clear();
            throw error;
        });
        pendingProxy.set(pending);
    }
    return pending.then((proxy) => proxy.env);
}

async function openWrangler(): Promise<PlatformProxy> {
    let wrangler: WranglerModule;
    try {
        const spec = 'wrangler';
        wrangler = (await import(/* @vite-ignore */ spec)) as WranglerModule;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new AstromechError(
            'Resolving a Cloudflare binding outside a Worker needs wrangler. ' +
                'Install it as a devDependency and make sure a wrangler.jsonc config exists. ' +
                `(${message})`,
            { cause: err }
        );
    }

    const proxy = await wrangler.getPlatformProxy();
    openProxy.set(proxy);
    return proxy;
}
