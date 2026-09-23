/**
 * Every transport answers a policy question the same way, because the policy
 * lives in the service methods and the scoped handle rather than in any one
 * route.
 *
 * Each case runs one call through every transport it applies to (REST, RPC,
 * the AI tool loop's scoped dispatch, `callMethod` as a trusted caller, and a
 * plugin's `ctx`) and expects one outcome from all of them: an error code, or
 * `null` for a read that finds nothing visible. A permission case skips the
 * trusted transports, which by design check no role.
 */

import type {
    AppContext,
    AstromechConfig,
    ManifestMethod,
    MethodManifest,
    PluginDefinition,
    Role,
    User,
} from '@/types/index';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { adminRole, roleWith } from '@tests/fixtures';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppContext } from '@/app-context/app-context';
import { currentServices } from '@/app-context/services';
import { getSession } from '@/auth/session';
import { setMethodManifest } from '@/codegen/manifest-registry';
import { generateMethodManifest } from '@/codegen/method-manifest';
import { ApiError } from '@/errors/api-error';
import { entryPermission } from '@/permissions/entry-permission';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity';
import { createPluginContext } from '@/plugins/runtime/plugin-runtime';
import { callMethod } from '@/policies/call-method';
import { createHttpApp } from '@/transport/http/app';
import { buildScopedDispatch } from '@/transport/tools/dispatch';

vi.mock('@/auth/session', () => ({ getSession: vi.fn() }));

const mockGetSession = vi.mocked(getSession);

/** A plugin with nothing of its own, so its `ctx` can be built. */
const probe: PluginDefinition = { package: 'probe' };

function testConfig(): AstromechConfig {
    return {
        ...makeTestConfig(),
        // No `staging`, so a staged read is a capability refusal.
        globals: [
            {
                key: 'site',
                label: 'Site',
                fields: [{ name: 'title', type: 'text', label: 'Title' }],
            },
        ],
        plugins: [probe],
    };
}

/** What a call came to: an error code, `null`, or `ok` for anything else. */
type Outcome = string;

let app: OpenAPIHono;
let api: string;
let manifest: MethodManifest;
/** The site's only admin, and the user every transport acts as. */
let admin: User;

beforeEach(async () => {
    mockGetSession.mockReset();
    await createTestDb();
    const resolved = setupTestConfig(testConfig());
    manifest = generateMethodManifest(resolved, [probe]);
    setMethodManifest(manifest);
    admin = await currentServices.users.create({
        data: { email: 'admin@test.dev', name: 'Admin', role: 'admin' },
    });
    api = `${resolved.basePath}/api`;
    app = createHttpApp(resolved) as unknown as OpenAPIHono;
});

/** The transports, each calling one manifest method with `args` as `role`. */
type Transport = (
    role: Role,
    id: string,
    args: Record<string, unknown>
) => Promise<Outcome>;

/** Answer the session lookup with the admin user under `role`. */
function signIn(role: Role): void {
    mockGetSession.mockResolvedValue({
        user: admin as never,
        role,
        session: { id: 's1', userId: admin.id } as never,
    });
}

/** The outcome an HTTP response carries. */
async function fromResponse(res: Response): Promise<Outcome> {
    const body = (await res.json()) as { data?: unknown; error?: { code: string } };
    if (body.error !== undefined) return body.error.code;
    return body.data === null ? 'null' : 'ok';
}

/** The outcome an in-process call comes to. */
async function fromCall(call: () => Promise<unknown>): Promise<Outcome> {
    try {
        return (await call()) === null ? 'null' : 'ok';
    } catch (error) {
        if (error instanceof ApiError) return error.code;
        throw error;
    }
}

/** The manifest method `id` names. */
function method(id: string): ManifestMethod {
    const found = manifest.methods.find((entry) => entry.id === id);
    if (found === undefined) throw new Error(`No manifest method ${id}`);
    return found;
}

/** The context an in-process transport acts as. */
function contextFor(role: Role): AppContext {
    return createAppContext({ user: admin, role });
}

const rpc: Transport = async (role, id, args) => {
    signIn(role);
    const res = await app.request(`${api}/rpc/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
    });
    return fromResponse(res);
};

const toolLoop: Transport = (role, id, args) => {
    const dispatch = buildScopedDispatch(method(id), contextFor(role));
    if (!dispatch.ok) throw new Error(dispatch.reason);
    return fromCall(() => dispatch.tool.invoke(args));
};

const trusted: Transport = (_role, id, args) =>
    fromCall(() => callMethod(method(id), args, 'trusted'));

/** A REST call: `path` under the API, with a JSON body for a write. */
function rest(verb: string, path: string, body?: unknown): Transport {
    return async (role) => {
        signIn(role);
        const res = await app.request(`${api}${path}`, {
            method: verb,
            headers: { 'Content-Type': 'application/json' },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        // A row with `notFound` answers a null read as 404.
        if (verb === 'GET' && res.status === 404) return 'null';
        return fromResponse(res);
    };
}

/** A plugin `ctx` call, acting as `role`. */
function pluginCtx(
    call: (ctx: ReturnType<typeof createPluginContext>) => Promise<unknown>
): Transport {
    return (role) =>
        fromCall(() =>
            call(createPluginContext(resolvePluginIdentity(probe), contextFor(role)))
        );
}

/** Run `id` with `args` through each transport, and every outcome. */
async function outcomes(
    role: Role,
    id: string,
    args: Record<string, unknown>,
    transports: Record<string, Transport>
): Promise<Record<string, Outcome>> {
    const results: Record<string, Outcome> = {};
    for (const [name, transport] of Object.entries(transports)) {
        results[name] = await transport(role, id, args);
    }
    return results;
}

/** `outcomes` equal to `expected` on every transport named. */
function every(transports: Record<string, Transport>, expected: Outcome) {
    return Object.fromEntries(Object.keys(transports).map((name) => [name, expected]));
}

describe('one answer on every transport', () => {
    it('refuses a publish-on-write to a role that may update but not publish', async () => {
        const entry = await currentServices.entries.create({
            type: 'post',
            data: { title: 'Draft' },
        });
        const role = roleWith([
            entryPermission('post', 'read'),
            entryPermission('post', 'update'),
        ]);
        const data = { status: 'published' } as const;
        const transports = {
            rest: rest('PUT', `/entries/post/${entry.id}`, data),
            rpc,
            toolLoop,
        };

        const results = await outcomes(
            role,
            'entries.post.update',
            { id: entry.id, data },
            transports
        );
        expect(results).toEqual(every(transports, 'FORBIDDEN'));
    });

    it('refuses `status` on a type with statuses off', async () => {
        const entry = await currentServices.entries.create({
            type: 'snippet',
            data: { fields: { key: 'k', value: 'v' } },
        });
        const data = { status: 'published' } as const;
        const transports = {
            rest: rest('PUT', `/entries/snippet/${entry.id}`, data),
            rpc,
            toolLoop,
            trusted,
            pluginCtx: pluginCtx((ctx) =>
                ctx.entries.update({ type: 'snippet', id: entry.id, data })
            ),
        };

        const results = await outcomes(
            adminRole,
            'entries.snippet.update',
            { id: entry.id, data },
            transports
        );
        expect(results).toEqual(every(transports, 'capability_not_supported'));
    });

    it('refuses to demote the last admin', async () => {
        const data = { role: 'editor' };
        const transports = {
            rest: rest('PUT', `/users/${admin.id}`, data),
            rpc,
            toolLoop,
            trusted,
            pluginCtx: pluginCtx((ctx) => ctx.users.update({ id: admin.id, data })),
        };

        const results = await outcomes(
            adminRole,
            'users.update',
            { id: admin.id, data },
            transports
        );
        expect(results).toEqual(every(transports, 'BAD_REQUEST'));
        expect((await currentServices.users.get({ id: admin.id }))?.role).toBe('admin');
    });

    it('reads a draft as nothing unless the call asks for the full shape', async () => {
        const entry = await currentServices.entries.create({
            type: 'post',
            data: { title: 'Draft' },
        });
        const transports = {
            rest: rest('GET', `/entries/post/${entry.id}`),
            rpc,
            toolLoop,
            trusted,
            pluginCtx: pluginCtx((ctx) =>
                ctx.entries.get({ type: 'post', id: entry.id })
            ),
        };

        const results = await outcomes(
            adminRole,
            'entries.post.get',
            { id: entry.id },
            transports
        );
        expect(results).toEqual(every(transports, 'null'));
    });

    it('refuses a staged read of a global without staging', async () => {
        const args = { key: 'site', staged: true, full: true };
        const transports = {
            rest: rest('GET', '/globals/site?staged=true&full=true'),
            rpc,
            toolLoop,
            trusted,
            pluginCtx: pluginCtx((ctx) => ctx.globals.get(args)),
        };

        const results = await outcomes(adminRole, 'globals.get', args, transports);
        expect(results).toEqual(every(transports, 'capability_not_supported'));
    });
});
