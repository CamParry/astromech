/**
 * `entryAdminPath` is the single source of the rule that a plugin entry type
 * lives at `/plugin/<ns>/entries/<name>/<id>` while a root type lives at
 * `/entries/<type>/<id>`. Both the media "used by" panel and the command
 * palette's live-entry results route through it, so a change here moves both.
 * The owner comes from the admin config (the test shim declares `forms/form`).
 *
 * `pluginEntryRouteParams` is the other half of the rule: the root routes call
 * it in `beforeLoad` to redirect a plugin's type id to the plugin route.
 *
 * An entry has one id across its locales, so which locale a link opens is a
 * search param on the same path.
 */

import { describe, expect, it } from 'vitest';
import {
    entryAdminPath,
    entryEditPath,
    entryVersionsPath,
    pluginEntryRouteParams,
    validateEntryEditSearch,
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

    it('carries a locale as a search param on the same path', () => {
        expect(entryAdminPath('post', 'abc123', { locale: 'fr' })).toBe(
            '/entries/post/abc123?locale=fr'
        );
        expect(entryAdminPath('forms/form', 'abc123', { locale: 'fr' })).toBe(
            '/plugin/forms/entries/form/abc123?locale=fr'
        );
    });

    it('routes an id no config declares to the root route, which renders not found', () => {
        expect(entryAdminPath('notinstalled/thing', 'x')).toBe(
            '/entries/notinstalled/thing/x'
        );
    });
});

describe('pluginEntryRouteParams', () => {
    it('returns null for a site type, so the root route renders', () => {
        expect(pluginEntryRouteParams('post')).toBeNull();
    });

    it('returns null for an inherited property name', () => {
        expect(pluginEntryRouteParams('constructor')).toBeNull();
    });

    it('splits a qualified type into the plugin route params', () => {
        expect(pluginEntryRouteParams('forms/form')).toEqual({
            name: 'forms',
            type: 'form',
        });
    });

    it('keeps everything after the owning namespace as the type', () => {
        expect(pluginEntryRouteParams('forms/nested/form')).toEqual({
            name: 'forms',
            type: 'nested/form',
        });
    });
});

describe('entryEditPath', () => {
    it('addresses the canonical row when nothing narrows it', () => {
        expect(entryEditPath('/entries/post', 'abc123')).toBe('/entries/post/abc123');
    });

    it('addresses one locale of the entry, keeping the id', () => {
        expect(entryEditPath('/entries/post', 'abc123', { locale: 'fr' })).toBe(
            '/entries/post/abc123?locale=fr'
        );
    });

    it('addresses the staged change of that locale', () => {
        expect(
            entryEditPath('/entries/post', 'abc123', { locale: 'fr', staged: true })
        ).toBe('/entries/post/abc123?locale=fr&staged=true');
    });

    it('omits `staged` when it is false, so the canonical link stays clean', () => {
        expect(
            entryEditPath('/entries/post', 'abc123', { locale: 'fr', staged: false })
        ).toBe('/entries/post/abc123?locale=fr');
    });
});

describe('entryVersionsPath', () => {
    it('lists one locale of the entry', () => {
        expect(entryVersionsPath('/entries/post', 'abc123', 'fr')).toBe(
            '/entries/post/abc123/versions?locale=fr'
        );
    });
});

describe('validateEntryEditSearch', () => {
    it('keeps a locale and drops an empty one', () => {
        expect(validateEntryEditSearch({ locale: 'fr' })).toEqual({ locale: 'fr' });
        expect(validateEntryEditSearch({ locale: '' })).toEqual({});
    });

    it('reads `staged` from the string a URL carries as well as a boolean', () => {
        expect(validateEntryEditSearch({ staged: 'true' })).toEqual({ staged: true });
        expect(validateEntryEditSearch({ staged: true })).toEqual({ staged: true });
        expect(validateEntryEditSearch({ staged: 'false' })).toEqual({});
    });
});
