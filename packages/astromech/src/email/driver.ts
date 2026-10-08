/**
 * The email driver contract: what `email` in the config must provide.
 */

/** No `from` — the driver supplies the envelope sender it was configured with. */
export type EmailMessage = {
    to: string;
    subject: string;
    html: string;
    text?: string;
};

export type EmailDriver = {
    name: string;
    send(message: EmailMessage): Promise<void>;
};
