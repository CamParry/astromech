/**
 * A global is addressed by key alone, so its edit path IS its base path and
 * everything narrowing the view (locale, staged) is a search param.
 *
 * `pluginGlobalRouteParams` is the rule that a plugin global lives at
 * `/plugin/<ns>/globals/<bare-key>`: the root route calls it in `beforeLoad` to
 * redirect a qualified key there.
 */

import { describe, expect, it } from 'vitest';
import {
    globalEditPath,
    globalVersionsPath,
    pluginGlobalRouteParams,
} from '@/admin/utilities/global-admin-path';

describe('globalEditPath', () => {
    it('is the base path itself when nothing narrows it', () => {
        expect(globalEditPath('/globals/site')).toBe('/globals/site');
    });

    it('carries the locale as a search param', () => {
        expect(globalEditPath('/globals/site', { locale: 'fr' })).toBe(
            '/globals/site?locale=fr'
        );
    });

    it('carries the staged row as a search param beside the locale', () => {
        expect(globalEditPath('/globals/site', { locale: 'fr', staged: true })).toBe(
            '/globals/site?locale=fr&staged=true'
        );
    });

    it('works the same under a plugin base path', () => {
        expect(globalEditPath('/plugin/seo/globals/settings', { locale: 'en' })).toBe(
            '/plugin/seo/globals/settings?locale=en'
        );
    });
});

describe('globalVersionsPath', () => {
    it('hangs versions off the base path with the locale', () => {
        expect(globalVersionsPath('/globals/site', 'fr')).toBe(
            '/globals/site/versions?locale=fr'
        );
    });

    it('omits the locale when none is given', () => {
        expect(globalVersionsPath('/globals/site')).toBe('/globals/site/versions');
    });
});

describe('pluginGlobalRouteParams', () => {
    it('answers null for a bare key, which the root route serves itself', () => {
        expect(pluginGlobalRouteParams('site')).toBeNull();
    });

    it('splits a qualified key into the plugin route params', () => {
        expect(pluginGlobalRouteParams('seo/settings')).toEqual({
            name: 'seo',
            key: 'settings',
        });
    });

    it('splits on the first separator only', () => {
        expect(pluginGlobalRouteParams('menus/main/footer')).toEqual({
            name: 'menus',
            key: 'main/footer',
        });
    });
});
