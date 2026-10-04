/**
 * The globals access rules on input that is not an object. A rule runs on the
 * raw input, so a malformed call must fail closed: it names the empty key's
 * permission, which no role holds, and never the publish permission.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { globalAccess, globalGetAccess } from '@/globals/internal/access';
import { makeGlobalsConfig } from './globals-config';

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeGlobalsConfig());
});

describe.each([null, undefined, 'site'])('a call whose input is %j', (input) => {
    it('needs the empty key update permission alone', () => {
        expect(globalAccess('update')(input)).toBe('global::update');
    });

    it('needs the empty key read permission to get', () => {
        expect(globalGetAccess(input)).toBe('global::read');
    });
});
