/**
 * `resolveConfig` strips every registry-held capability.
 *
 * `ResolvedConfig`'s `Omit` states the rule in the type; this asserts the
 * runtime destructure enforces it too. Without that, `...rest` would carry a
 * live driver into the resolved config and on into `ctx.config`, since
 * `PluginConfigView` picks `media` whole.
 */

import { describe, expect, it } from 'vitest';
import { resolveConfig } from '@/boot/config-resolver.js';
import type {
    AstromechConfig,
    DatabaseDriver,
    EmailDriver,
    ImageDriver,
    ModelInstance,
    SchedulerDriver,
    StorageDriver,
} from '@/types/index.js';

const dbDriver = {
    type: 'test',
    getInstance: () => {
        throw new Error('not called');
    },
    createDialect: () => {
        throw new Error('not called');
    },
} as unknown as DatabaseDriver;

const storageDriver: StorageDriver = {
    name: 'noop',
    async put() {
        return undefined;
    },
    async get() {
        return null;
    },
    async stat() {
        return null;
    },
    async delete() {
        return undefined;
    },
    async list() {
        return { keys: [] };
    },
};

const emailDriver: EmailDriver = {
    name: 'noop',
    async send() {
        return undefined;
    },
};

const imageDriver: ImageDriver = {
    name: 'noop',
    async transform() {
        throw new Error('not called');
    },
};

const schedulerDriver: SchedulerDriver = {
    name: 'noop',
    start() {
        return undefined;
    },
};

/** Every capability populated, so a missing strip shows up as a present key. */
function fullConfig(): AstromechConfig {
    return {
        db: dbDriver,
        storage: storageDriver,
        email: emailDriver,
        scheduler: schedulerDriver,
        ai: { model: {} as ModelInstance },
        plugins: [],
        entries: {},
        media: { access: 'public', fields: [], image: { driver: imageDriver } },
    };
}

describe('resolveConfig strips registry-held capabilities', () => {
    // Read through an index signature: the whole point is that the type does not
    // admit these keys, so a property access would not compile.
    const resolved = resolveConfig(fullConfig()) as unknown as Record<string, unknown>;

    it.each(['db', 'storage', 'email', 'scheduler', 'ai', 'plugins'])(
        'drops %s',
        (key) => {
            expect(resolved).not.toHaveProperty(key);
        }
    );

    it('drops media.image, which a top-level omit cannot reach', () => {
        expect(resolved['media']).not.toHaveProperty('image');
    });

    it('keeps the rest of media', () => {
        expect(resolved['media']).toMatchObject({ access: 'public', fields: [] });
    });
});
