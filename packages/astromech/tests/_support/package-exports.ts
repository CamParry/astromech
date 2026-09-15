/**
 * Follows an `astromech/...` specifier through `exports` and
 * `publishConfig.exports` in `package.json` to the source file each map ends at.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import tsupConfig from '../../tsup.config';

type ExportEntry = string | { types?: string; default?: string };
type ExportsMap = Record<string, ExportEntry>;

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Describe each exports map that does not lead `specifier` to an existing
 * file. A `dist` target counts when a tsup entry builds it from a source file
 * that exists, so no build is needed.
 */
export function findMissingExportTargets(specifier: string): string[] {
    const manifest = JSON.parse(
        readFileSync(join(packageRoot, 'package.json'), 'utf8')
    ) as { exports: ExportsMap; publishConfig: { exports: ExportsMap } };
    const subpath = `.${specifier.slice('astromech'.length)}`;
    const maps = {
        exports: manifest.exports,
        'publishConfig.exports': manifest.publishConfig.exports,
    };

    return Object.entries(maps).flatMap(([mapName, map]) => {
        const entry = map[subpath];
        if (entry === undefined) return [`${specifier}: ${mapName} has no "${subpath}"`];
        const target = typeof entry === 'string' ? entry : entry.default;
        if (target === undefined) {
            return [`${specifier}: ${mapName} "${subpath}" has no default target`];
        }
        const file = sourceFileOf(target);
        if (file === undefined) {
            return [
                `${specifier}: ${mapName} targets ${target}, which no tsup entry builds`,
            ];
        }
        return existsSync(file)
            ? []
            : [`${specifier}: ${mapName} targets ${target}, but ${file} does not exist`];
    });
}

function sourceFileOf(target: string): string | undefined {
    if (!target.startsWith('./dist/')) return join(packageRoot, target);
    const entryName = target.slice('./dist/'.length).replace(/\.js$/, '');
    const source = tsupEntries()[entryName];
    return source === undefined ? undefined : join(packageRoot, source);
}

function tsupEntries(): Record<string, string> {
    if (typeof tsupConfig === 'function') {
        throw new Error(
            'tsup.config.ts exports a function; read its entries another way'
        );
    }
    const configs = Array.isArray(tsupConfig) ? tsupConfig : [tsupConfig];
    return Object.assign(
        {},
        ...configs.map((config) =>
            config.entry !== undefined && !Array.isArray(config.entry) ? config.entry : {}
        )
    ) as Record<string, string>;
}
