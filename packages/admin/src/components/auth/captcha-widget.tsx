/**
 * The captcha on the sign-in and reset forms: `useCaptcha` renders the site's
 * widget into the container `<CaptchaWidget />` mounts, for one action.
 */

import type { CaptchaHandle } from 'astromech/shared';
import type { RefObject } from 'react';
import { renderCaptcha } from 'astromech/shared';
import { useEffect, useRef } from 'react';
import adminConfig from 'virtual:astromech/admin-config';

/** What `useCaptcha` returns. */
export type Captcha = {
    container: RefObject<HTMLDivElement | null>;
    /** The next token, or undefined when the site sets no captcha. */
    getToken(): Promise<string | undefined>;
    /** Tokens are single-use: call after every response. */
    reset(): void;
};

/** Render the site's captcha for `action` once `<CaptchaWidget />` is mounted. */
export function useCaptcha(action: string): Captcha {
    const container = useRef<HTMLDivElement | null>(null);
    const handle = useRef<Promise<CaptchaHandle> | null>(null);

    useEffect(() => {
        const widget = adminConfig.captcha;
        const element = container.current;
        if (widget === null || element === null) return;

        const rendered = renderCaptcha(element, { ...widget, action });
        handle.current = rendered;
        return () => {
            handle.current = null;
            rendered.then(
                (current) => {
                    current.remove();
                },
                () => undefined
            );
        };
    }, [action]);

    return {
        container,
        async getToken() {
            const rendered = handle.current;
            return rendered === null ? undefined : (await rendered).getToken();
        },
        reset() {
            handle.current?.then(
                (current) => {
                    current.reset();
                },
                () => undefined
            );
        },
    };
}

/** The mount point for `captcha`'s widget; nothing renders when the site sets no captcha. */
export function CaptchaWidget({ captcha }: { captcha: Captcha }) {
    if (adminConfig.captcha === null) return null;
    return <div className="am-auth-captcha" ref={captcha.container} />;
}
