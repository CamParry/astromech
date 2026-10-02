/**
 * @vitest-environment happy-dom
 *
 * PluginSlot, and with it the `slots` half of the plugins-components shim.
 */

import type { AdminSlotName } from '@/types/config';
import type { RenderResult } from '@testing-library/react';
import { act } from '@testing-library/react';
import { slots } from 'virtual:astromech/plugins/components';
import { afterEach, describe, expect, it } from 'vitest';
import { PluginSlot } from '@/admin/components/plugins/plugin-slot';
import { renderWithProviders } from '../../_support/render-admin';

const drawer = slots['right-drawer'] ?? [];

afterEach(() => {
    drawer.length = 0;
});

describe('PluginSlot', () => {
    it('should render nothing for a slot no plugin contributed to', async () => {
        // Also the proof the test shim exports the slot at all.
        expect(slots['right-drawer']).toEqual([]);
        const mounted = await mount('right-drawer', []);

        expect(mounted.html()).toBe('');
        await mounted.unmount();
    });

    it('should render a contribution the current user has permission for', async () => {
        drawer.push(contribution('chat:drawer', 'chat:use'));

        const mounted = await mount('right-drawer', ['chat:use']);

        expect(mounted.html()).toContain('drawer');
        await mounted.unmount();
    });

    it('should filter out a contribution whose permission the user lacks', async () => {
        drawer.push(contribution('chat:drawer:denied', 'chat:use'));

        const mounted = await mount('right-drawer', []);

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

/**
 * Mount one slot for a user holding `permissions`, awaiting any lazy
 * contribution. The providers render nothing of their own into the container.
 */
async function mount(name: AdminSlotName, permissions: string[]) {
    let view: RenderResult | undefined;
    await act(async () => {
        view = renderWithProviders(<PluginSlot name={name} />, { permissions });
    });
    if (view === undefined) throw new Error('the slot never rendered');
    const { container, unmount } = view;

    return {
        html: () => container.innerHTML,
        unmount: async () => {
            await act(async () => unmount());
        },
    };
}
