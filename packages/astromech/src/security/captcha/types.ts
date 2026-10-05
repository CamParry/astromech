/**
 * The captcha vocabulary the server check, the browser renderer and the config
 * share. Browser-safe: it imports nothing.
 */

/** The captcha services core can check. */
export const CAPTCHA_PROVIDERS = ['turnstile', 'recaptcha', 'hcaptcha'] as const;

export type CaptchaProviderName = (typeof CAPTCHA_PROVIDERS)[number];

/** The request header that carries the token the widget produced. */
export const CAPTCHA_HEADER = 'x-captcha-response';

/** The action name each form asks its widget for, and the server expects back. */
export const CAPTCHA_ACTIONS = {
    signIn: 'sign_in',
    passwordReset: 'password_reset',
    formSubmit: 'form_submit',
} as const;

/** The outcome of checking one token. */
export type CaptchaVerdict = { ok: true } | { ok: false; reason: string };

/** What the browser needs to render a widget: never the secret. */
export type CaptchaWidget = {
    provider: CaptchaProviderName;
    siteKey: string;
};

/** The `security.captcha` setting. The secret is `ASTROMECH_CAPTCHA_SECRET`. */
export type CaptchaConfig = CaptchaWidget & {
    /** reCAPTCHA only. Default 0.5. */
    minScore?: number;
    /** Hostnames a token may come from. Default: the request's own. */
    hostnames?: string[];
};
