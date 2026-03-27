import type { EmailDriver, EmailMessage } from '@/types/index.js';

export type SmtpDriverOptions = {
    host: string;
    port?: number;
    secure?: boolean;
    auth?: {
        user: string;
        pass: string;
    };
};

/**
 * SMTP email driver via Nodemailer.
 * Requires nodemailer to be installed: npm install nodemailer
 * Node.js only — not compatible with Cloudflare Workers.
 */
export class SmtpDriver implements EmailDriver {
    readonly name = 'smtp';
    private options: SmtpDriverOptions;
    private transporter: unknown = null;

    constructor(options: SmtpDriverOptions) {
        this.options = options;
    }

    async send({ to, from, subject, html, text }: EmailMessage): Promise<void> {
        if (!this.transporter) {
            // nodemailer is an optional peer dependency — suppress the missing-module error.
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const nodemailer = await import('nodemailer').catch(() => {
                throw new Error(
                    '[Astromech] SmtpDriver requires nodemailer: npm install nodemailer',
                );
            }) as { createTransport: (opts: unknown) => unknown };
            this.transporter = nodemailer.createTransport(this.options);
        }
        await (this.transporter as { sendMail: (opts: unknown) => Promise<unknown> }).sendMail({
            to,
            from,
            subject,
            html,
            ...(text && { text }),
        });
    }
}
