/**
 * A minimal SDK method, so the teaching plugin demonstrates plugin RPC and not
 * only its admin surfaces.
 *
 * It is also the repo's only SDK method on a MULTI-WORD plugin namespace, which
 * makes it the one place the identity derivation is observable end-to-end:
 * `demo-rating` → namespace `demo_rating` → SDK key `demoRating`. Both
 * transports address it by the SDK key —
 * `Astromech.plugins.demoRating.describe()` locally, `POST
 * /api/plugins/demoRating/describe` over HTTP — and the namespace never appears
 * on the wire.
 */

import { defineServiceMethod } from 'astromech';
import { RATING_FIELD_TYPE } from '../types.js';

export type RatingDescription = {
    fieldType: string;
    /** Entry types declaring at least one `rating` field. */
    usedBy: string[];
    max: number;
};

export const ratingSdk = {
    describe: defineServiceMethod<undefined, RatingDescription>({
        access: 'authenticated',
        summary: 'Describe the rating field type and where it is used.',
        mutates: false,
        handler: (_input, ctx): RatingDescription => ({
            fieldType: RATING_FIELD_TYPE,
            usedBy: ctx.config.entryTypesWithField(RATING_FIELD_TYPE),
            max: 5,
        }),
    }),
};
