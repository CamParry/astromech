/**
 * The plugin service namespace parses a method's result through its `output`
 * schema when it declares one, as `bind()` does for core methods, and passes it
 * through unparsed when it does not.
 */

import type { PluginDefinition } from '@/types/index';
import { adminRole } from '@tests/fixtures';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAppContext } from '@/app-context/app-context';
import { OutputValidationError } from '@/errors/output-validation';
import { pluginServicesFor } from '@/plugins/runtime/plugin-services';

/** A stored row with a key the public shape leaves out. */
const row = { id: 'r1', label: 'Home', internal: 'secret' };

const probe: PluginDefinition = {
    package: 'probe',
    service: {
        declared: {
            access: 'public',
            input: z.object({ label: z.unknown().optional() }),
            output: z.object({ id: z.string(), label: z.string() }),
            mutates: false,
            handler: (input: { label?: unknown }) => ({ ...row, ...input }),
        },
        undeclared: {
            access: 'public',
            input: z.object({}),
            mutates: false,
            handler: () => row,
        },
    },
};

beforeEach(async () => {
    await createTestDb();
    setupTestConfig({ ...makeTestConfig(), plugins: [probe] });
});

/** The namespace as a caller holding no session reaches it. */
function probeMethods(): Record<string, (input?: unknown) => Promise<unknown>> {
    const namespace = pluginServicesFor(
        createAppContext({ user: null, role: adminRole })
    );
    return namespace['probe'] as Record<string, (input?: unknown) => Promise<unknown>>;
}

describe('plugin service methods', () => {
    it('parse the result through a declared output, stripping unknown keys', async () => {
        await expect(probeMethods()['declared']?.({})).resolves.toEqual({
            id: 'r1',
            label: 'Home',
        });
    });

    it('throw OutputValidationError naming the method when the result fails', async () => {
        await expect(probeMethods()['declared']?.({ label: 7 })).rejects.toThrow(
            OutputValidationError
        );
        await expect(probeMethods()['declared']?.({ label: 7 })).rejects.toThrow(
            /^The result of plugins\.probe\.declared doesn't match its output schema \(id r1\)/
        );
    });

    it('answer the result unparsed without an output', async () => {
        await expect(probeMethods()['undeclared']?.({})).resolves.toEqual(row);
    });
});
