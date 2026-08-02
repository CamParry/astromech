/**
 * The contract a spam provider satisfies. A site passes one to `forms({ spam })`,
 * so third-party providers are ordinary values, not a fixed union.
 */

/** The outcome of checking one submission's token. */
export type SpamVerdict = { ok: true } | { ok: false; reason: string };

/** Request metadata a provider may use to strengthen its check. */
export type SpamContext = { ip?: string | undefined };

/**
 * One spam provider. `name` and `siteKey` are published to the browser through
 * the `get` method; `verify` runs server-side and never sees a secret leave it.
 */
export type SpamProvider = {
    /** Identifies which widget the front end should render, e.g. `turnstile`. */
    name: string;
    /** The public key handed to the browser. */
    siteKey: string;
    verify(token: string | undefined, context: SpamContext): Promise<SpamVerdict>;
};
