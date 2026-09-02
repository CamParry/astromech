/** What an admin route declares about the thing the user is currently looking at. */

export type AiContextKind = 'entries' | 'globals' | 'media' | 'users' | 'pages';

export type AiContextReference = {
    kind: AiContextKind;
    /** Entry type id, bare (`posts`) or qualified (`redirects/redirect`). Entries only. */
    type?: string;
    /** Identifier of the single item in view — a global's `key`. Absent on list and index screens. */
    id?: string;
    /** Human label for the subject, already resolved by the route. */
    label: string;
};

/** A declared reference with its position: lower `depth` is less specific. */
export type AiContextItem = {
    reference: AiContextReference;
    depth: number;
    order: number;
};
