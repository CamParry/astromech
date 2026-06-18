import type { EmailDriver, EmailMessage } from '@/types/index.js';

export type ResendDriverOptions = {
    apiKey: string;
};

/**
 * Resend email driver.
 * Uses native fetch — works in Node.js and Cloudflare Workers.
 */
export class ResendDriver implements EmailDriver {
    readonly name = 'resend';
    private apiKey: string;

    constructor({ apiKey }: ResendDriverOptions) {
        this.apiKey = apiKey;
    }

    async send({ to, from, subject, html, text }: EmailMessage): Promise<void> {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ to, from, subject, html, ...(text && { text }) }),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`[Astromech] ResendDriver error ${res.status}: ${body}`);
        }
    }
}
