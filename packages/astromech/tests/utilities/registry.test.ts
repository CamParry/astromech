import { beforeEach, describe, expect, it } from 'vitest';
import { createRegistry } from '@/utilities/registry';

type Driver = { name: string };

beforeEach(() => {
    globalThis.__astromech = undefined;
});

describe('createRegistry', () => {
    it('round-trips a value through set/get', () => {
        const reg = createRegistry<Driver>('test.roundTrip');
        reg.set({ name: 'a' });
        expect(reg.get().name).toBe('a');
    });

    it('throws on get() when the slot is unset, naming the slot and the hint', () => {
        const reg = createRegistry<Driver>('test.unset', { hint: 'Wire it up.' });
        expect(() => reg.get()).toThrow(/test\.unset/);
        expect(() => reg.get()).toThrow(/Wire it up\./);
    });

    it('omits the trailing space when there is no hint', () => {
        const reg = createRegistry<Driver>('test.noHint');
        expect(() => reg.get()).toThrow("[Astromech] 'test.noHint' is not configured.");
    });

    it('peek() returns null when unset', () => {
        const reg = createRegistry<Driver>('test.peek', { required: false });
        expect(reg.peek()).toBeNull();
        reg.set({ name: 'b' });
        expect(reg.peek()).toEqual({ name: 'b' });
    });

    it('does not collide with a registry of a different name', () => {
        const one = createRegistry<Driver>('test.one');
        const two = createRegistry<Driver>('test.two');
        one.set({ name: 'one' });
        expect(one.get().name).toBe('one');
        expect(two.peek()).toBeNull();
    });

    it('set() overwrites', () => {
        const reg = createRegistry<Driver>('test.overwrite');
        reg.set({ name: 'first' });
        reg.set({ name: 'second' });
        expect(reg.get().name).toBe('second');
    });

    it('accessors detach from the registry object', () => {
        const reg = createRegistry<Driver>('test.detached');
        const set = reg.set;
        const get = reg.get;
        set({ name: 'c' });
        expect(get().name).toBe('c');
    });
});
