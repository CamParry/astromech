/**
 * @vitest-environment happy-dom
 *
 * PluginSlot, and with it the `slots` half of the plugins-components shim.
 * There is no `@testing-library/react` here, so this drives a real React root
 * (same approach as tests/admin/context/ai-context.test.tsx).
 */

import type { AdminSlotName } from '@/types/config';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { slots } from 'virtual:astromech/plugins/components';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PluginSlot } from '@/admin/components/plugins/plugin-slot';

const granted = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock('@/admin/hooks/use-permissions', () => ({
    usePermissions: () => ({
        hasPermission: (permission: string) => granted.permissions.includes(permission),
    }),
}));

const drawer = slots['right-drawer'] ?? [];

afterEach(() => {
    drawer.length = 0;
    granted.permissions = [];
});

describe('PluginSlot', () => {
    it('should render nothing for a slot no plugin contributed to', async () => {
        // Also the proof the test shim exports the slot at all.
        expect(slots['right-drawer']).toEqual([]);
        const mounted = await mount('right-drawer');

        expect(mounted.html()).toBe('');
        await mounted.unmount();
    });

    it('should render a contribution the current user has permission for', async () => {
        granted.permissions = ['chat:use'];
        drawer.push(contribution('chat:drawer', 'chat:use'));

        const mounted = await mount('right-drawer');

        expect(mounted.html()).toContain('drawer');
        await mounted.unmount();
    });

    it('should filter out a contribution whose permission the user lacks', async () => {
        drawer.push(contribution('chat:drawer:denied', 'chat:use'));

        const mounted = await mount('right-drawer');

        expect(mounted.html()).toBe('');
        await mounted.unmount();
    });
});

/** A slot contribution shaped exactly like the client manifest emits one. */
function contribution(id: string, permission: string | null) {
    return {
        id,
        load: () => Promise.resolve({ default: () => <span>drawer</span> }),
        plugin: 'chat',
        serviceKey: 'chat',
        namespace: 'chat',
        permission,
        order: 0,
    };
}

/** Mount one slot into a real root, awaiting any lazy contribution. */
async function mount(name: AdminSlotName) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
        root.render(<PluginSlot name={name} />);
    });

    return {
        html: () => host.innerHTML,
        unmount: async () => {
            await act(async () => root.unmount());
            host.remove();
        },
    };
}
