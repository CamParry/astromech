import { beforeEach, describe, expect, it } from 'vitest';
import { createKeyedRegistry, createRegistry } from '@/utilities/registry';

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
        expect(() => reg.get()).toThrow("'test.noHint' is not configured.");
    });

    it('tryGet() returns null when unset', () => {
        const reg = createRegistry<Driver>('test.peek', { required: false });
        expect(reg.tryGet()).toBeNull();
        reg.set({ name: 'b' });
        expect(reg.tryGet()).toEqual({ name: 'b' });
    });

    it('does not collide with a registry of a different name', () => {
        const one = createRegistry<Driver>('test.one');
        const two = createRegistry<Driver>('test.two');
        one.set({ name: 'one' });
        expect(one.get().name).toBe('one');
        expect(two.tryGet()).toBeNull();
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

describe('createKeyedRegistry', () => {
    it('round-trips a value under its key', () => {
        const reg = createKeyedRegistry<Driver>('test.keyed.roundTrip');
        reg.set('a', { name: 'first' });
        expect(reg.get('a').name).toBe('first');
        expect(reg.tryGet('a')).toEqual({ name: 'first' });
    });

    it('throws on get() for an unset key, naming the slot and the key', () => {
        const reg = createKeyedRegistry<Driver>('test.keyed.unset');
        expect(() => reg.get('missing')).toThrow(/test\.keyed\.unset/);
        expect(() => reg.get('missing')).toThrow(/missing/);
    });

    it('tryGet() returns null and has() false for an unset key', () => {
        const reg = createKeyedRegistry<Driver>('test.keyed.probe');
        expect(reg.tryGet('a')).toBeNull();
        expect(reg.has('a')).toBe(false);
        reg.set('a', { name: 'x' });
        expect(reg.has('a')).toBe(true);
    });

    it('keys() lists every set key, and clear() empties the map', () => {
        const reg = createKeyedRegistry<Driver>('test.keyed.clear');
        reg.set('a', { name: 'x' });
        reg.set('b', { name: 'y' });
        expect(reg.keys()).toEqual(['a', 'b']);
        reg.clear();
        expect(reg.keys()).toEqual([]);
        expect(reg.tryGet('a')).toBeNull();
    });

    it('does not collide with a keyed registry of a different name', () => {
        const one = createKeyedRegistry<Driver>('test.keyed.one');
        const two = createKeyedRegistry<Driver>('test.keyed.two');
        one.set('shared', { name: 'one' });
        expect(two.tryGet('shared')).toBeNull();
    });

    it('survives a wholesale reset of the namespace', () => {
        const reg = createKeyedRegistry<Driver>('test.keyed.reset');
        reg.set('a', { name: 'x' });
        globalThis.__astromech = undefined;
        expect(reg.tryGet('a')).toBeNull();
        reg.set('a', { name: 'y' });
        expect(reg.get('a').name).toBe('y');
    });
});
