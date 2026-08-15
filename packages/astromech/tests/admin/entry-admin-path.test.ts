/**
 * `entryAdminPath` is the single source of the rule that a plugin entry type
 * lives at `/plugin/<ns>/entries/<bare-type>/<id>` while a root type lives at
 * `/entries/<type>/<id>`. Both the media "used by" panel and the command
 * palette's live-entry results route through it, so a change here moves both.
 *
 * `pluginEntryRouteParams` is the other half of the rule: the root routes call
 * it in `beforeLoad` to redirect a qualified type param to the plugin route.
 */

import { describe, expect, it } from 'vitest';
import {
    entryAdminPath,
    pluginEntryRouteParams,
} from '@/admin/utilities/entry-admin-path';

describe('entryAdminPath', () => {
    it('routes a bare type id to the root entries route', () => {
        expect(entryAdminPath('post', 'abc123')).toBe('/entries/post/abc123');
    });

    it('routes a qualified type id to the plugin route, splitting the namespace off', () => {
        expect(entryAdminPath('forms/form', 'abc123')).toBe(
            '/plugin/forms/entries/form/abc123'
        );
    });

    it('never emits a qualified id into the root route', () => {
        // The failure this helper exists to prevent: `/entries/forms/form/<id>`
        // renders but 404s on navigation.
        expect(entryAdminPath('forms/form', 'abc123')).not.toContain(
            '/entries/forms/form'
        );
    });

    it('resolves the path from the type id alone, not from installed config', () => {
        // No plugin registry is consulted, so an uninstalled namespace still
        // produces the plugin-shaped path rather than falling back to the root
        // route. Both 404, but only one of them 404s for the right reason.
        expect(entryAdminPath('notinstalled/thing', 'x')).toBe(
            '/plugin/notinstalled/entries/thing/x'
        );
    });
});

describe('pluginEntryRouteParams', () => {
    it('returns null for a bare type, so the root route renders', () => {
        expect(pluginEntryRouteParams('post')).toBeNull();
    });

    it('splits a qualified type into the plugin route params', () => {
        expect(pluginEntryRouteParams('forms/form')).toEqual({
            name: 'forms',
            type: 'form',
        });
    });

    it('splits on the first separator only, keeping the rest as the type', () => {
        expect(pluginEntryRouteParams('forms/nested/form')).toEqual({
            name: 'forms',
            type: 'nested/form',
        });
    });
});
