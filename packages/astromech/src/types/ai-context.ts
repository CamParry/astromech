/** What an admin route declares about the thing the user is currently looking at. */

export type AIContextKind = 'entries' | 'media' | 'users' | 'pages';

export type AIContextReference = {
    kind: AIContextKind;
    /** Entry type id, bare (`posts`) or qualified (`redirects/redirect`). Entries only. */
    type?: string;
    /** Identifier of the single item in view. Absent on list and index screens. */
    id?: string;
    /** Human label for the subject, already resolved by the route. */
    label: string;
};

/** A declared reference with its position: lower `depth` is less specific. */
export type AIContextItem = {
    reference: AIContextReference;
    depth: number;
    order: number;
};
