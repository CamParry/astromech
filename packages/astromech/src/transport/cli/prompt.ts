/** Questions a command asks on the terminal. */

import { createInterface } from 'node:readline/promises';

/** Ask each of `questions` in turn and return the answers. */
export async function ask(questions: string[]): Promise<string[]> {
    if (questions.length === 0) return [];
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answers: string[] = [];
        for (const question of questions) answers.push(await rl.question(question));
        return answers;
    } finally {
        rl.close();
    }
}

/** Ask a yes/no `question`; only `y` is yes. */
export async function confirm(question: string): Promise<boolean> {
    const [answer] = await ask([`${question} (y/N) `]);
    return answer?.trim().toLowerCase() === 'y';
}
