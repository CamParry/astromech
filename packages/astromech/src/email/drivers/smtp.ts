import type { EmailDriver } from '@/types/index';

export type SmtpOptions = {
    host: string;
    port?: number;
    secure?: boolean;
    auth?: {
        user: string;
        pass: string;
    };
    from: string;
};

/**
 * SMTP email driver via Nodemailer.
 * Requires nodemailer to be installed: npm install nodemailer
 * Node.js only — not compatible with Cloudflare Workers.
 */
export function smtp({ from, ...transport }: SmtpOptions): EmailDriver {
    let transporter: { sendMail: (opts: unknown) => Promise<unknown> } | null = null;

    return {
        name: 'smtp',
        async send({ to, subject, html, text }) {
            if (!transporter) {
                // nodemailer is an optional peer dependency — suppress the missing-module error.
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                const nodemailer = (await import('nodemailer').catch(() => {
                    throw new Error(
                        '[Astromech] smtp() requires nodemailer: npm install nodemailer'
                    );
                })) as {
                    createTransport: (opts: unknown) => {
                        sendMail: (opts: unknown) => Promise<unknown>;
                    };
                };
                transporter = nodemailer.createTransport(transport);
            }
            await transporter.sendMail({
                to,
                from,
                subject,
                html,
                ...(text && { text }),
            });
        },
    };
}
