/**
 * Unit tests for settings visibility helpers.
 *
 * All tests call `isPublicSettingKey` directly — no DB, no virtual modules.
 */

import { describe, expect, it } from 'vitest';
import { isPublicSettingKey } from './settings-visibility.js';

describe('isPublicSettingKey', () => {
    // -----------------------------------------------------------------------
    // (a) Private key excluded from public read
    // -----------------------------------------------------------------------

    it('returns false for a key not in the public list', () => {
        expect(isPublicSettingKey('secret', ['globals', 'globals:'])).toBe(false);
    });

    it('returns false when publicKeys is empty (everything is private by default)', () => {
        expect(isPublicSettingKey('globals', [])).toBe(false);
    });

    // -----------------------------------------------------------------------
    // (b) Exact-match key is public
    // -----------------------------------------------------------------------

    it('returns true for an exact-match key', () => {
        expect(isPublicSettingKey('globals', ['globals', 'globals:'])).toBe(true);
    });

    it('returns true for a raw publicSettings entry', () => {
        expect(isPublicSettingKey('my-key', ['my-key'])).toBe(true);
    });

    // -----------------------------------------------------------------------
    // (c) Prefix match covers per-locale variants
    // -----------------------------------------------------------------------

    it('returns true for a per-locale key when the prefix is listed', () => {
        expect(isPublicSettingKey('globals:en', ['globals', 'globals:'])).toBe(true);
    });

    it('returns true for a different locale variant', () => {
        expect(isPublicSettingKey('globals:fr', ['globals', 'globals:'])).toBe(true);
    });

    it('does NOT treat a bare key as a prefix', () => {
        // 'globals' (no trailing colon) should not match 'globals:en'
        expect(isPublicSettingKey('globals:en', ['globals'])).toBe(false);
    });

    it('prefix match is not a substring — requires key to start with the prefix', () => {
        // 'other:en' should not match prefix 'globals:'
        expect(isPublicSettingKey('other:en', ['globals:'])).toBe(false);
    });

    // -----------------------------------------------------------------------
    // (d) Multiple keys — only the matching one grants access
    // -----------------------------------------------------------------------

    it('returns false when only unrelated keys are listed', () => {
        expect(isPublicSettingKey('secret', ['globals', 'site:', 'theme'])).toBe(false);
    });

    it('returns true when one of multiple listed keys matches exactly', () => {
        expect(isPublicSettingKey('theme', ['globals', 'site:', 'theme'])).toBe(true);
    });

    it('returns true when a prefix in the list matches', () => {
        expect(isPublicSettingKey('site:en', ['globals', 'site:', 'theme'])).toBe(true);
    });

    // -----------------------------------------------------------------------
    // (e) Prefix entries ending with ':' only — no false positives
    // -----------------------------------------------------------------------

    it('a prefix ending with colon does not match an unrelated key that happens to contain a colon', () => {
        expect(isPublicSettingKey('plugin:other:path', ['globals:'])).toBe(false);
    });
});
