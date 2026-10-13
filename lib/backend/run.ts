"use client";

import { useCallback, useState } from "react";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { useMutation } from "./hooks";
import { fieldErrorsOf, toClientError } from "./errors";
import type { ClientError } from "./errors";
import { useT } from "../i18n-client";
import { toast } from "../toast";

/**
 * A mutation with the standard UI around it (BLUEPRINT 7.4): busy flag, errors translated by code (errors.<CODE>),
 * a toast on failure unless the caller handles field errors, an optional toast on success.
 */
export function useRun<M extends FunctionReference<"mutation">>(ref: M, opts: { success?: string; silent?: boolean } = {}) {
  const t = useT();
  const mutate = useMutation(ref);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClientError | null>(null);
  const run = useCallback(
    async (args: FunctionArgs<M>): Promise<FunctionReturnType<M> | undefined> => {
      setBusy(true);
      setError(null);
      try {
        const r = await mutate(args);
        if (opts.success) toast(opts.success, "ok");
        return r;
      } catch (e) {
        const ce = toClientError(e);
        setError(ce);
        if (!opts.silent) toast(t(`errors.${ce.code}`), "error");
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [mutate, opts.success, opts.silent, t],
  );
  return { run, busy, error, fields: error ? fieldErrorsOf(error) : {}, message: error ? t(`errors.${error.code}`) : null, reset: () => setError(null) };
}
