import type { EmailDriver } from '@/email/driver';

export type ConsoleEmailOptions = {
    from: string;
};

/** Logs each message instead of sending. For local development. */
export function consoleEmail({ from }: ConsoleEmailOptions): EmailDriver {
    return {
        name: 'console',
        async send({ to, subject }) {
            console.log(
                `[Astromech Email] To: ${to} | From: ${from} | Subject: ${subject}`
            );
        },
    };
}
