/**
 * `seo.section()`'s type as a site's config calls it. `typecheck` checks this
 * file; vitest does not run it.
 */

import type { Field } from 'astromech';
import { describe, expectTypeOf, it } from 'vitest';
import { seo } from '../../src/index';

describe('seo.section', () => {
    it('is typed as the site calls it, without the identity parameter', () => {
        expectTypeOf(seo.section).toEqualTypeOf<
            (options?: { label?: Field['label'] }) => Field
        >();
    });
});
