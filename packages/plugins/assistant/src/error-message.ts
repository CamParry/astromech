/** The message of a thrown value, and nothing else about it. Pure, so the
 * server loop and the drawer share one copy. */
export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
