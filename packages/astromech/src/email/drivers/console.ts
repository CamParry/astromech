import type { EmailDriver, EmailMessage } from '@/types/index.js';

/**
 * Console email driver for local development.
 * Logs email details to stdout instead of sending.
 */
export class ConsoleDriver implements EmailDriver {
    readonly name = 'console';

    async send({ to, from, subject }: EmailMessage): Promise<void> {
        console.log(`[Astromech Email] To: ${to} | From: ${from} | Subject: ${subject}`);
    }
}
