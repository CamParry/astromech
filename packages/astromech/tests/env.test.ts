/** `resolveNodeEnv`: anything but an explicit development or test mode is production. */

import { afterEach, describe, expect, it } from 'vitest';
import { clearEnvSource, resolveNodeEnv, setEnvSource } from '@/env';

afterEach(() => {
    clearEnvSource();
});

describe('resolveNodeEnv', () => {
    it.each(['development', 'test', 'production'] as const)(
        'reads %s as itself',
        (mode) => {
            setEnvSource({ NODE_ENV: mode });

            expect(resolveNodeEnv()).toBe(mode);
        }
    );

    it('reads any other value as production', () => {
        setEnvSource({ NODE_ENV: 'staging' });

        expect(resolveNodeEnv()).toBe('production');
    });
});
