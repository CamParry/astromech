/**
 * A minimal service method, so the teaching plugin demonstrates plugin RPC and
 * not only its admin surfaces.
 *
 * It is also the repo's only service method on a MULTI-WORD plugin namespace,
 * which makes it the one place the identity derivation is observable
 * end-to-end: `demo-rating` → namespace `demo_rating` → service key
 * `demoRating`. Both transports address it by the service key —
 * `Astromech.plugins.demoRating.describe()` locally, `POST
 * /api/plugins/demoRating/describe` over HTTP — and the namespace never appears
 * on the wire.
 */

import { defineServiceMethod, noInput } from 'astromech';
import { RATING_FIELD_TYPE } from '../fields/rating.js';

export type RatingDescription = {
    fieldType: string;
    /** Entry types declaring at least one `rating` field. */
    usedBy: string[];
    max: number;
};

export const ratingService = {
    describe: defineServiceMethod<undefined, RatingDescription>({
        access: 'authenticated',
        summary: 'Describe the rating field type and where it is used.',
        input: noInput(),
        mutates: false,
        handler: (_input, ctx): RatingDescription => ({
            fieldType: RATING_FIELD_TYPE,
            usedBy: ctx.config.entryTypesWithField(RATING_FIELD_TYPE),
            max: 5,
        }),
    }),
};
