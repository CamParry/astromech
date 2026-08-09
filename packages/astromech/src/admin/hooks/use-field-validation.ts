/**
 * Client-side field validation for the entry form.
 *
 * This is not a second rule engine. It runs the SAME `processFields` the server
 * runs, over the same `Field[]` the server was given — the admin
 * config is built from the very same definitions and shipped to the browser.
 * There is therefore nothing to keep in sync: a new rule, a new field type or a
 * changed message appears here the moment it appears on the server.
 *
 * What the browser skips is decided by DATA-DEPENDENCE, not by
 * declarative-vs-imperative. A check that needs a database read cannot run here;
 * everything else can, including the type-intrinsic field-type validators
 * (`url`, `email`, `json`, `key-value`), which are pure core code already in
 * this bundle.
 *
 * Reveal policy (when a message is allowed to become visible) lives here too —
 * see `reportBlur`. The pipeline decides what is wrong; this hook decides when
 * the author is told.
 *
 * Warnings are advisory and block nothing, so only an editor has any use for
 * them: the server never asks the pipeline to collect them, and they have no
 * wire representation. They exist solely here, alongside the errors.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Field, FieldErrors, FieldReads, ValidationStage } from '@/types/index';
// Deep import: the `fields/` barrel reaches server code (virtual config / DB).
import { processFields } from '@/fields/pipeline';

/**
 * Data-dependent checks are server-only and are skipped in silence.
 *
 * `unique` needs a read the browser cannot make. `custom` is a function, so
 * `JSON.stringify` flattens the rule to `{}` on its way into the admin config
 * and the pipeline's `runRule` falls through every branch — inert, but by
 * accident, so don't rely on it silently. Neither is surfaced as a "pending"
 * state: the server runs both on submit and answers with a 422.
 */
const CLIENT_READS: FieldReads = { isUnique: () => Promise.resolve(true) };

export type FieldValidationHandle = {
    /** What the UI should render: server errors, overlaid by revealed client ones. */
    errors: FieldErrors;
    /** Revealed advisory messages. An error on the same path supersedes them. */
    warnings: FieldErrors;
    /** The author changed this field's value. */
    markDirty: (path: string) => void;
    /** Focus left this field. */
    reportBlur: (path: string) => void;
    /** Reveal everything at `stage` and hand back the full error map. */
    validateAll: (stage: ValidationStage) => Promise<FieldErrors>;
    setServerErrors: (errors: FieldErrors) => void;
    resetServerErrors: () => void;
};

export type UseFieldValidationOptions = {
    /** The full field tree — `[...main, ...sidebar]` from the admin config. */
    definitions: Field[];
    values: Record<string, unknown>;
    operation: 'create' | 'update';
};

/** The revealed subset of a message map, in the order the map lists it. */
function revealedSubset(
    messages: FieldErrors,
    revealed: ReadonlySet<string>
): FieldErrors {
    const visible: FieldErrors = {};
    for (const path of revealed) {
        const message = messages[path];
        if (message !== undefined) visible[path] = message;
    }
    return visible;
}

/** One pipeline pass, reduced to the two maps the UI renders. */
type RunResult = { errors: FieldErrors; warnings: FieldErrors };

export function useFieldValidation({
    definitions,
    values,
    operation,
}: UseFieldValidationOptions): FieldValidationHandle {
    const [clientErrors, setClientErrors] = useState<FieldErrors>({});
    const [serverErrors, setServerErrorsState] = useState<FieldErrors>({});
    // There is no server counterpart: the server is never asked to collect
    // warnings, so this is the whole warning state.
    const [clientWarnings, setClientWarnings] = useState<FieldErrors>({});

    /** Paths whose value the author has changed this session. */
    const dirtyRef = useRef<Set<string>>(new Set());
    /** Paths currently permitted to show a client message. */
    const revealedRef = useRef<Set<string>>(new Set());

    // The inputs live in refs so every callback below stays referentially stable
    // — they are handed down through context to every rendered field.
    const valuesRef = useRef(values);
    valuesRef.current = values;
    const definitionsRef = useRef(definitions);
    definitionsRef.current = definitions;
    const operationRef = useRef(operation);
    operationRef.current = operation;

    // Monotonic run id: a slower earlier run must not overwrite a later one.
    const runIdRef = useRef(0);

    const run = useCallback(async (stage: ValidationStage): Promise<RunResult> => {
        // `structuredClone` is belt-and-braces. The pipeline clones on its
        // way in, but it also writes coerced values and (on 'create') seeded
        // defaults back into what it was handed, and none of that may leak
        // into the live form state. Only the message maps are used.
        const { errors, warnings } = await processFields(
            structuredClone(valuesRef.current),
            definitionsRef.current,
            {
                operation: operationRef.current,
                stage,
                host: { kind: 'entry', record: null },
                user: null,
                reads: CLIENT_READS,
                collectWarnings: true,
            }
        );
        return { errors, warnings };
    }, []);

    const markDirty = useCallback((path: string): void => {
        dirtyRef.current.add(path);
        // A field the author has since edited must not keep showing the
        // server's stale message about the old value.
        setServerErrorsState((prev) => {
            if (prev[path] === undefined) return prev;
            const { [path]: _dropped, ...rest } = prev;
            return rest;
        });
    }, []);

    const reportBlur = useCallback(
        (path: string): void => {
            // A pristine field stays silent, so tabbing through a form to survey
            // it turns nothing red.
            if (!dirtyRef.current.has(path)) return;
            // Revealed unconditionally: a warning-only field would never open up
            // if reveal were conditional on an error. Both maps render through
            // `revealedSubset`, so a revealed path with nothing to say is silent.
            revealedRef.current.add(path);
            const runId = ++runIdRef.current;
            void run('save').then(({ errors, warnings }) => {
                if (runId !== runIdRef.current) return;
                setClientErrors(revealedSubset(errors, revealedRef.current));
                setClientWarnings(revealedSubset(warnings, revealedRef.current));
            });
        },
        [run]
    );

    // Re-validate on change, but only once something is already showing: a
    // corrected field clears on the keystroke that fixes it rather than on the
    // second blur, and a field that has never erred stays quiet while typed in.
    useEffect(() => {
        if (revealedRef.current.size === 0) return;
        const runId = ++runIdRef.current;
        void run('save').then(({ errors, warnings }) => {
            if (runId !== runIdRef.current) return;
            for (const path of [...revealedRef.current]) {
                if (errors[path] === undefined && warnings[path] === undefined)
                    revealedRef.current.delete(path);
            }
            setClientErrors(revealedSubset(errors, revealedRef.current));
            setClientWarnings(revealedSubset(warnings, revealedRef.current));
        });
    }, [values, run]);

    const validateAll = useCallback(
        async (stage: ValidationStage): Promise<FieldErrors> => {
            const runId = ++runIdRef.current;
            const { errors, warnings } = await run(stage);
            // The caller awaited THIS run and acts on its result, so it is
            // returned either way; only the revealed state defers to a newer run.
            if (runId === runIdRef.current) {
                revealedRef.current = new Set([
                    ...Object.keys(errors),
                    ...Object.keys(warnings),
                ]);
                setClientErrors(errors);
                setClientWarnings(warnings);
            }
            // Only errors come back: the caller gates the submit on them, and a
            // warning must not block one.
            return errors;
        },
        [run]
    );

    const setServerErrors = useCallback((errors: FieldErrors): void => {
        setServerErrorsState(errors);
    }, []);

    const resetServerErrors = useCallback((): void => {
        setServerErrorsState({});
    }, []);

    // Client wins on a shared key — it was computed against what is on screen
    // now, where the server's answer describes the last submitted value.
    //
    // `required` can never appear here through `reportBlur`: the field is empty,
    // so it fails the dirty gate, and the 'save' stage skips completeness checks
    // anyway. It reaches the UI only via `validateAll('publish')`.
    const errors = useMemo(
        () => ({ ...serverErrors, ...clientErrors }),
        [serverErrors, clientErrors]
    );

    return useMemo(
        () => ({
            errors,
            warnings: clientWarnings,
            markDirty,
            reportBlur,
            validateAll,
            setServerErrors,
            resetServerErrors,
        }),
        [
            errors,
            clientWarnings,
            markDirty,
            reportBlur,
            validateAll,
            setServerErrors,
            resetServerErrors,
        ]
    );
}
