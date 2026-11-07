import { z } from "zod";

/** A-066: server actions check what they are sent (ids are UUIDs, modes and methods come from a fixed list). */
export const uuid = z.string().uuid();
export const payMethod = z.enum(["cash", "card_in_person", "bank_transfer", "revolut"]);

const INVALID = "That request wasn't valid. Please refresh the page and try again.";

export function parse<S extends z.ZodType>(schema: S, input: unknown): { ok: true; data: z.infer<S> } | { ok: false; error: string } {
  const r = schema.safeParse(input);
  return r.success ? { ok: true, data: r.data } : { ok: false, error: INVALID };
}
