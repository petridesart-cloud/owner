import "server-only";
import { cache } from "react";
import { db } from "@/lib/supabase/admin";
import { prettyKind, type Kind } from "@/lib/kind-label";

export type { Kind };

/** What packages, trials and drop-ins can be "for": Reformer, Mat and any class type she adds with its own packages. */
export const getKinds = cache(async (): Promise<Kind[]> => {
  const { data } = await db().from("credit_kinds").select("key, label, sort").order("sort");
  return data?.length ? data : [{ key: "reformer", label: "Reformer", sort: 1 }, { key: "mat", label: "Mat", sort: 2 }];
});

/** "Reformer", "Mat", "Pre and post natal"… */
export async function kindLabel(key: string | null | undefined) {
  if (!key) return "";
  return (await getKinds()).find((k) => k.key === key)?.label ?? prettyKind(key);
}

/** A key → label map, for pages that show many. */
export async function kindLabels() {
  return Object.fromEntries((await getKinds()).map((k) => [k.key, k.label])) as Record<string, string>;
}
