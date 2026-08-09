import type { EmailDriver } from '@/types/index.js';

export type ResendOptions = {
    apiKey: string;
    from: string;
};

/**
 * Resend email driver.
 * Uses native fetch — works in Node.js and Cloudflare Workers.
 */
export function resend({ apiKey, from }: ResendOptions): EmailDriver {
    return {
        name: 'resend',
        async send({ to, subject, html, text }) {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ to, from, subject, html, ...(text && { text }) }),
            });
            if (!res.ok) {
                const body = await res.text();
                throw new Error(`[Astromech] Resend error ${res.status}: ${body}`);
            }
        },
    };
}
