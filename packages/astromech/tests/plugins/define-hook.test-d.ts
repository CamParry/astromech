/**
 * `defineHook` types a handler's payload by its event. `typecheck` checks this
 * file; vitest does not run it.
 */

import type {
    EntryCreateContext,
    EntryDeleteContext,
    GlobalUpdateContext,
    PluginContext,
} from 'astromech';
import { defineHook } from 'astromech';
import { describe, expectTypeOf, it } from 'vitest';

declare module 'astromech' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface AstromechPluginHookEvents {
        'acme-hooks:ping': { message: string };
    }
}

describe('defineHook', () => {
    it("gives a core event's handler that event's payload and the plugin context", () => {
        defineHook('entry:beforeCreate', (ctx, plugin) => {
            expectTypeOf(ctx).toEqualTypeOf<EntryCreateContext>();
            expectTypeOf(plugin).toEqualTypeOf<PluginContext>();
        });
        defineHook('global:afterUpdate', (ctx) => {
            expectTypeOf(ctx).toEqualTypeOf<GlobalUpdateContext>();
        });
        defineHook('entry:afterDelete', (ctx) => {
            expectTypeOf(ctx).toEqualTypeOf<EntryDeleteContext>();
        });
    });

    it("rejects a handler reading a key another event's payload has", () => {
        // @ts-expect-error `global` belongs to the global events' payload.
        defineHook('entry:beforeCreate', (ctx) => ctx.global);
    });

    it('rejects a before-handler returning something other than its payload', () => {
        // @ts-expect-error A handler returns nothing or the payload.
        defineHook('entry:beforeUpdate', () => 'skip');
    });

    it('gives a plugin-declared event the payload its augmentation declares', () => {
        defineHook('acme-hooks:ping', (payload) => {
            expectTypeOf(payload).toEqualTypeOf<{ message: string }>();
        });
    });

    it('accepts an undeclared event name, with an unknown payload', () => {
        // `HookEvent` is open (`string & {}`): a plugin fires events core never sees.
        defineHook('acme-hooks:undeclared', (payload) => {
            expectTypeOf(payload).toBeUnknown();
        });
    });
});
