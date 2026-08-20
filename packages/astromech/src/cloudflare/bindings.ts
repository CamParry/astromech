/**
 * Cross-runtime Cloudflare binding resolution. Drivers reference bindings by
 * name ('MEDIA', 'DB'), not object, because `cloudflare:workers` doesn't
 * resolve in the Node processes that also load the app config.
 */

import { AstromechError } from '@/errors/index';
import { createRegistry } from '@/registry';

type BindingEnv = Record<string, unknown>;

type PlatformProxy = {
    env: BindingEnv;
    dispose(): Promise<void>;
};

type WranglerModule = {
    getPlatformProxy(): Promise<PlatformProxy>;
};

/**
 * Memoised as a promise so concurrent callers share one detection, and
 * stored on `globalThis` because tsup emits several entry chunks that
 * would otherwise each get their own copy of a module-level variable.
 */
const bindingEnv = createRegistry<Promise<BindingEnv>>('cloudflareEnv', {
    required: false,
});

/** Held only so `disposeBindings()` can shut the wrangler proxy down. */
const platformProxy = createRegistry<PlatformProxy>('cloudflareProxy', {
    required: false,
});

/**
 * Supply the binding environment directly, bypassing runtime detection.
 * For tests and for hosts that already hold an `env` object.
 */
export function setBindingEnv(env: BindingEnv): void {
    bindingEnv.set(Promise.resolve(env));
}

/** True inside a Cloudflare Worker isolate, by the user agent the runtime sets. */
export function isWorkersRuntime(): boolean {
    return (
        typeof globalThis.navigator !== 'undefined' &&
        globalThis.navigator.userAgent === 'Cloudflare-Workers'
    );
}

async function detectEnv(): Promise<BindingEnv> {
    if (isWorkersRuntime()) {
        const spec = 'cloudflare:workers';
        const mod = (await import(/* @vite-ignore */ spec)) as { env: BindingEnv };
        return mod.env;
    }

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
    platformProxy.set(proxy);
    return proxy.env;
}

/** Resolve a named binding (e.g. 'MEDIA', 'DB') from the host environment. */
export async function resolveBinding<T>(name: string): Promise<T> {
    let pending = bindingEnv.get();
    if (!pending) {
        // Drop a failed detection rather than memoising it forever, so a caller
        // that installs wrangler (or calls setBindingEnv) can still recover.
        pending = detectEnv().catch((err: unknown) => {
            bindingEnv.clear();
            throw err;
        });
        bindingEnv.set(pending);
    }
    const env = await pending;

    if (!(name in env)) {
        const available = Object.keys(env);
        const list = available.length > 0 ? available.join(', ') : '(none)';
        throw new AstromechError(
            `Cloudflare binding '${name}' not found. Available bindings: ${list}. ` +
                'Check the `bindings` section of your wrangler config.'
        );
    }

    return env[name] as T;
}

/**
 * Release the wrangler platform proxy. Node processes that resolved a binding
 * will not exit until this runs.
 */
export async function disposeBindings(): Promise<void> {
    const proxy = platformProxy.get();
    if (proxy) {
        await proxy.dispose();
    }
    platformProxy.clear();
    bindingEnv.clear();
}

/**
 * @internal Test-only. Clears the memoised environment and the stored proxy
 * reference (without disposing it) so tests can re-exercise runtime
 * detection from a clean slate.
 */
export function resetBindingEnv(): void {
    bindingEnv.clear();
    platformProxy.clear();
}
