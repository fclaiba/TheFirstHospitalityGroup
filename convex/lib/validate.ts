import type { z } from "zod";
import { fieldErrors } from "../../schemas";
import { appError } from "./errors";

/** Re-validates with the same Zod schema the client used (project rule: shared validation). */
export function parseOrThrow<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw appError("INVALID_INPUT", undefined, { fields: fieldErrors(result.error) });
  return result.data;
}
