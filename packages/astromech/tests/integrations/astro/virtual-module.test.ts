/**
 * `virtualModule()`, the Vite plugin that serves one `virtual:` id under
 * Rollup's `\0` convention.
 */
import { describe, expect, it } from 'vitest';
import { virtualModule } from '@/integrations/astro/virtual-module';

const id = 'virtual:test/module';
const source = 'export default 1;';

describe('virtualModule()', () => {
    const plugin = virtualModule(id, () => source);

    it('resolves its own id to the \\0-prefixed id', () => {
        expect(plugin.resolveId(id)).toBe(`\0${id}`);
    });

    it('leaves any other id unresolved', () => {
        expect(plugin.resolveId('virtual:test/other')).toBeUndefined();
        expect(plugin.resolveId(`\0${id}`)).toBeUndefined();
    });

    it('loads the source for the resolved id', () => {
        expect(plugin.load(`\0${id}`)).toBe(source);
    });

    it('loads nothing for the unresolved id or another id', () => {
        expect(plugin.load(id)).toBeUndefined();
        expect(plugin.load('\0virtual:test/other')).toBeUndefined();
    });
});
