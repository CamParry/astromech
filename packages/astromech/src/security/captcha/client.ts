/**
 * The browser side of the captcha check: loads a provider's script once per
 * page and renders one widget per form. Browser-only; call it from an effect.
 */

import type { CaptchaProviderName, CaptchaWidget } from './types';

/** A rendered widget. Tokens are single-use, so call `reset` after each submit. */
export type CaptchaHandle = {
    /** Resolves the next token. reCAPTCHA v3 executes on each call. */
    getToken(): Promise<string>;
    reset(): void;
    remove(): void;
};

type ChallengeOptions = {
    sitekey: string;
    action?: string;
    callback: (token: string) => void;
    'expired-callback': () => void;
    'error-callback': () => void;
};

/** The part of Turnstile's and hCaptcha's browser API this module calls. */
type ChallengeApi = {
    render(container: HTMLElement, options: ChallengeOptions): string;
    reset(id: string): void;
    remove(id: string): void;
};

/** The part of reCAPTCHA v3's browser API this module calls. */
type RecaptchaApi = {
    ready(callback: () => void): void;
    execute(siteKey: string, options: { action: string }): Promise<string>;
};

type CaptchaGlobals = {
    turnstile?: ChallengeApi;
    hcaptcha?: ChallengeApi;
    grecaptcha?: RecaptchaApi;
};

const SCRIPTS: Record<CaptchaProviderName, (siteKey: string) => string> = {
    turnstile: () =>
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    hcaptcha: () => 'https://js.hcaptcha.com/1/api.js?render=explicit',
    recaptcha: (siteKey) =>
        `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`,
};

const loading = new Map<CaptchaProviderName, Promise<void>>();

/**
 * Load the provider's script once per page, then render one widget into
 * `container` for `action`.
 */
export async function renderCaptcha(
    container: HTMLElement,
    options: CaptchaWidget & { action: string }
): Promise<CaptchaHandle> {
    await loadScript(options.provider, options.siteKey);
    const globals = window as Window & CaptchaGlobals;

    if (options.provider === 'recaptcha') {
        const api = globals.grecaptcha;
        if (api === undefined) throw new Error('reCAPTCHA did not load.');
        return recaptchaHandle(api, options.siteKey, options.action);
    }

    const api = options.provider === 'turnstile' ? globals.turnstile : globals.hcaptcha;
    if (api === undefined) throw new Error(`${options.provider} did not load.`);
    return challengeHandle(api, container, options);
}

/** A widget the visitor sees: the token arrives through its callback. */
function challengeHandle(
    api: ChallengeApi,
    container: HTMLElement,
    options: CaptchaWidget & { action: string }
): CaptchaHandle {
    let token: string | undefined;
    let waiting: { resolve(token: string): void; reject(error: Error): void }[] = [];

    const id = api.render(container, {
        sitekey: options.siteKey,
        // hCaptcha has no action.
        ...(options.provider === 'turnstile' ? { action: options.action } : {}),
        callback: (value) => {
            token = value;
            for (const waiter of waiting) waiter.resolve(value);
            waiting = [];
        },
        'expired-callback': () => {
            token = undefined;
        },
        'error-callback': () => {
            token = undefined;
            for (const waiter of waiting) {
                waiter.reject(new Error('The captcha check could not run.'));
            }
            waiting = [];
        },
    });

    return {
        getToken: () =>
            token !== undefined
                ? Promise.resolve(token)
                : new Promise((resolve, reject) => {
                      waiting.push({ resolve, reject });
                  }),
        reset: () => {
            token = undefined;
            api.reset(id);
        },
        remove: () => {
            token = undefined;
            api.remove(id);
        },
    };
}

/** reCAPTCHA v3 has no widget: each call executes and returns a fresh token. */
function recaptchaHandle(
    api: RecaptchaApi,
    siteKey: string,
    action: string
): CaptchaHandle {
    return {
        getToken: () =>
            new Promise((resolve, reject) => {
                api.ready(() => {
                    api.execute(siteKey, { action }).then(resolve, reject);
                });
            }),
        reset: () => undefined,
        remove: () => undefined,
    };
}

/** Add the provider's `<script>` once, resolving when its global exists. */
function loadScript(provider: CaptchaProviderName, siteKey: string): Promise<void> {
    const globals = window as Window & CaptchaGlobals;
    if (globals[provider === 'recaptcha' ? 'grecaptcha' : provider] !== undefined) {
        return Promise.resolve();
    }

    const existing = loading.get(provider);
    if (existing !== undefined) return existing;

    const pending = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = SCRIPTS[provider](siteKey);
        script.async = true;
        script.addEventListener('load', () => {
            resolve();
        });
        script.addEventListener('error', () => {
            loading.delete(provider);
            reject(new Error(`The ${provider} script failed to load.`));
        });
        document.head.append(script);
    });
    loading.set(provider, pending);
    return pending;
}
