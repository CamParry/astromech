/**
 * The vitest settings every package's config shares.
 */

/**
 * Throws when the command line passes arguments after a bare `--`.
 *
 * Vitest's CLI parser (cac) moves everything after `--` out of the file
 * filters, so `vitest run -- tests/a.test.ts` runs the whole suite. pnpm keeps
 * the `--` when it runs a script, which makes
 * `pnpm -F <package> test:run -- <path>` that command. Failing here, when the
 * config loads, stops the run before it starts.
 */
export function assertNoArgumentsAfterDoubleDash(): void {
    const index = process.argv.indexOf('--');
    if (index === -1) return;
    const ignored = process.argv.slice(index + 1).join(' ');
    if (ignored === '') return;
    throw new Error(
        `Vitest ignores the arguments after \`--\` (${ignored}) and would run the whole ` +
            `suite. pnpm passes \`--\` on to the script, so leave it out: ` +
            `\`pnpm -F <package> test:run ${ignored}\`.`
    );
}
