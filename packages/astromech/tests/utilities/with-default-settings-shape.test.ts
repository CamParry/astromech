/**
 * `withDefaultSettingsShape` — plugin altitude reads its own private settings at
 * full shape unless it says otherwise.
 *
 * Settings are private by default, so a wrapper that failed to inject
 * `full: true` would silently return `null` for every plugin's own keys with no
 * type error anywhere. An explicit `full: false` must still win.
 */

import { describe, expect, it } from 'vitest';
import { withDefaultSettingsShape } from '@/utilities/with-default-shape.js';
import type { JsonValue, Setting, SettingsApi } from '@/types/index.js';

type Recorded = {
    all: ({ full?: boolean } | undefined)[];
    get: { key: string; locale?: string; full?: boolean }[];
    set: { key: string; value: JsonValue }[];
};

function fakeSettings(): { api: SettingsApi; calls: Recorded } {
    const calls: Recorded = { all: [], get: [], set: [] };
    const api: SettingsApi = {
        all(params) {
            calls.all.push(params);
            return Promise.resolve([]);
        },
        get(params) {
            calls.get.push(params);
            return Promise.resolve(null);
        },
        set(params) {
            calls.set.push(params);
            return Promise.resolve({
                key: params.key,
                value: params.value,
                updatedAt: new Date(),
                updatedBy: null,
            } satisfies Setting);
        },
    };
    return { api, calls };
}

describe('withDefaultSettingsShape', () => {
    it('injects full: true into get() when the caller did not specify it', async () => {
        const { api, calls } = fakeSettings();
        await withDefaultSettingsShape(api, 'full').get({ key: 'plugin:acme:cfg' });

        expect(calls.get).toEqual([{ key: 'plugin:acme:cfg', full: true }]);
    });

    it('passes an explicit full: false through unchanged', async () => {
        const { api, calls } = fakeSettings();
        await withDefaultSettingsShape(api, 'full').get({ key: 'site', full: false });

        expect(calls.get).toEqual([{ key: 'site', full: false }]);
    });

    it('preserves the other get() members while injecting full', async () => {
        const { api, calls } = fakeSettings();
        await withDefaultSettingsShape(api, 'full').get({ key: 'site', locale: 'de' });

        expect(calls.get).toEqual([{ key: 'site', locale: 'de', full: true }]);
    });

    it('injects full: true into all() called with no arguments', async () => {
        const { api, calls } = fakeSettings();
        await withDefaultSettingsShape(api, 'full').all();

        expect(calls.all).toEqual([{ full: true }]);
    });

    it('passes an explicit all({ full: false }) through unchanged', async () => {
        const { api, calls } = fakeSettings();
        await withDefaultSettingsShape(api, 'full').all({ full: false });

        expect(calls.all).toEqual([{ full: false }]);
    });

    it('forwards set() verbatim', async () => {
        const { api, calls } = fakeSettings();
        await withDefaultSettingsShape(api, 'full').set({ key: 'site', value: 'x' });

        expect(calls.set).toEqual([{ key: 'site', value: 'x' }]);
    });

    it('returns the underlying api untouched at public shape', () => {
        const { api } = fakeSettings();
        expect(withDefaultSettingsShape(api, 'public')).toBe(api);
    });
});
