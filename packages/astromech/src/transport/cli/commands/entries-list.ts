import type { Entry, QueryResult } from '@/types/index';
import { defineCommand } from 'citty';
import { configArgs, jsonArgs, localeArgs } from '../common-args';
import { withApplication } from '../config';
import { callEntryMethod } from '../methods';
import { printResult } from '../output';

export default defineCommand({
    meta: { name: 'entries:list', description: 'List entries for a given type' },
    args: {
        type: { type: 'positional', required: true, description: 'Entry type slug' },
        status: { type: 'string', description: 'Filter by status' },
        ...localeArgs,
        limit: { type: 'string', description: 'Max results', default: '20' },
        ...jsonArgs,
        ...configArgs,
    },
    run: ({ args }) =>
        withApplication(args, async () => {
            const limitNum = parseInt(args.limit, 10);
            const { data } = await callEntryMethod<QueryResult<Entry>>(
                args.type,
                'query',
                {
                    limit: limitNum,
                    ...(args.locale ? { locale: args.locale } : {}),
                    ...(args.status ? { where: { status: args.status } } : {}),
                }
            );
            printResult(data, {
                json: args.json,
                text: () => {
                    if (data.length === 0) {
                        console.log('No entries found.');
                        return;
                    }
                    for (const e of data) {
                        console.log(`${e.id}  ${e.status}  ${e.title}`);
                    }
                },
            });
        }),
});
