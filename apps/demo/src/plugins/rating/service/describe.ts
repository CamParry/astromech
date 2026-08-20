/**
 * A minimal service method, so the teaching plugin demonstrates plugin RPC.
 * The repo's only service on a multi-word namespace: `demo-rating` derives
 * the service key `demoRating`, which both transports address it by.
 */

import { defineServiceMethod, noInput } from 'astromech';
import { RATING_FIELD_TYPE } from '../fields/rating';

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
